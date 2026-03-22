import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { fileURLToPath } from 'url';
import { scanDirectory } from './scanner.js';
import { buildPdf } from './pdf-builder.js';
import { initBrowser, renderMarkdownFile, renderTextFile } from './separator.js';
import type { BuildRequest, AssemblyItem, SessionFile } from '../src/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Parse CLI args: --port and --cwd
function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

const PORT = parseInt(getArg('--port') ?? process.env.PORT ?? '3001');
const CWD = getArg('--cwd') ?? process.cwd();

const app = express();
app.use(express.json({ limit: '2mb' }));

// CORS only needed in dev (Vite proxies in prod)
if (process.env.NODE_ENV !== 'production') {
  app.use(cors());
}

// ── API routes ─────────────────────────────────────────────────────────────

app.get('/api/files', async (_req, res) => {
  const files = await scanDirectory(CWD);
  res.json(files);
});

app.post('/api/build', async (req, res) => {
  const body = req.body as BuildRequest;
  if (!body?.items || !Array.isArray(body.items)) {
    res.status(400).json({ error: 'Invalid request body' });
    return;
  }
  // Write to tmpdir so the output never appears in the scanned directory
  const result = await buildPdf(body, os.tmpdir());
  const filePath = path.join(os.tmpdir(), result.filename);
  res.setHeader('X-Pdf-Warnings', JSON.stringify(result.warnings ?? []));
  res.setHeader('X-Pdf-Pages', String(result.pageCount));
  res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
  res.contentType('application/pdf');
  res.sendFile(filePath);
});

app.post('/api/preview-pdf', async (req, res) => {
  const body = req.body as BuildRequest;
  if (!body?.items || !Array.isArray(body.items)) {
    res.status(400).json({ error: 'Invalid request body' });
    return;
  }
  const result = await buildPdf({ ...body, outputName: '__preview__.pdf' }, os.tmpdir());
  const filePath = path.join(os.tmpdir(), result.filename);
  res.setHeader('X-Pdf-Warnings', JSON.stringify(result.warnings ?? []));
  res.setHeader('X-Pdf-Pages', String(result.pageCount));
  res.sendFile(filePath);
});

// Render a file for preview: markdown is converted to PDF via puppeteer;
// all other types are served as-is.
app.get('/api/render-file', async (req, res) => {
  const rawPath = String(req.query.p ?? '');
  if (!rawPath) { res.status(400).json({ error: 'Missing p parameter' }); return; }
  const resolved = path.resolve(rawPath);
  const cwdResolved = path.resolve(CWD);
  if (!resolved.startsWith(cwdResolved + path.sep) && resolved !== cwdResolved) {
    res.status(403).json({ error: 'Access denied' }); return;
  }
  try {
    await fs.access(resolved);
    const ext = path.extname(resolved).toLowerCase();
    if (ext === '.md' || ext === '.markdown') {
      const pdfBytes = await renderMarkdownFile(resolved);
      res.contentType('application/pdf');
      res.send(pdfBytes);
    } else if (ext === '.txt') {
      const pdfBytes = await renderTextFile(resolved);
      res.contentType('application/pdf');
      res.send(pdfBytes);
    } else {
      res.sendFile(resolved);
    }
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/preview', async (req, res) => {
  const rawPath = String(req.query.p ?? '');
  if (!rawPath) { res.status(400).json({ error: 'Missing p parameter' }); return; }
  const resolved = path.resolve(rawPath);
  const cwdResolved = path.resolve(CWD);
  if (!resolved.startsWith(cwdResolved + path.sep) && resolved !== cwdResolved) {
    res.status(403).json({ error: 'Access denied' }); return;
  }
  try {
    await fs.access(resolved);
    res.sendFile(resolved);
  } catch {
    res.status(404).json({ error: 'File not found' });
  }
});

app.get('/api/download/:filename', async (req, res) => {
  const name = path.basename(req.params.filename);
  if (!name || name.includes('/') || name.includes('..')) {
    res.status(400).json({ error: 'Invalid filename' });
    return;
  }
  const filePath = path.join(CWD, name);
  try {
    await fs.access(filePath);
    res.download(filePath, name);
  } catch {
    res.status(404).json({ error: 'File not found' });
  }
});

// ── Session persistence ─────────────────────────────────────────────────────

app.get('/api/sessions', async (_req, res) => {
  try {
    const entries = await fs.readdir(CWD, { withFileTypes: true });
    const sessions = [];
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.pdfasm')) {
        const stat = await fs.stat(path.join(CWD, entry.name));
        sessions.push({ filename: entry.name, savedAt: stat.mtime.toISOString() });
      }
    }
    sessions.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
    res.json(sessions);
  } catch {
    res.json([]);
  }
});

app.post('/api/sessions', async (req, res) => {
  const { filename, outputName, tocEnabled, assemblyItems, tocItems } = req.body as {
    filename: string;
    outputName: string;
    tocEnabled: boolean;
    assemblyItems: AssemblyItem[];
    tocItems: { id: string; label: string }[];
  };

  const safeName = path.basename(String(filename)).replace(/[^a-zA-Z0-9._-]/g, '_');
  const finalName = safeName.endsWith('.pdfasm') ? safeName : `${safeName}.pdfasm`;

  const session: SessionFile = {
    version: 1,
    savedAt: new Date().toISOString(),
    outputName,
    tocEnabled,
    items: assemblyItems.map(item => {
      const entry: SessionFile['items'][number] = {
        id: item.id,
        kind: item.kind,
        label: item.label,
        enabled: item.enabled,
        includeInToc: item.includeInToc,
      };
      if (item.path) entry.relativePath = path.relative(CWD, item.path);
      if (item.scale !== undefined) entry.scale = item.scale;
      if (item.separatorText !== undefined) entry.separatorText = item.separatorText;
      return entry;
    }),
    tocItems,
  };

  await fs.writeFile(path.join(CWD, finalName), JSON.stringify(session, null, 2), 'utf-8');
  res.json({ filename: finalName });
});

app.get('/api/sessions/:filename', async (req, res) => {
  const safeName = path.basename(req.params.filename);
  if (!safeName.endsWith('.pdfasm')) {
    res.status(400).json({ error: 'Invalid session filename' });
    return;
  }
  let session: SessionFile;
  try {
    const raw = await fs.readFile(path.join(CWD, safeName), 'utf-8');
    session = JSON.parse(raw);
  } catch {
    res.status(404).json({ error: 'Session not found or unreadable' });
    return;
  }

  const assemblyItems: AssemblyItem[] = await Promise.all(
    session.items.map(async item => {
      if (!item.relativePath) {
        // separator — no file to check
        return { ...item, missing: false };
      }
      const absPath = path.join(CWD, item.relativePath);
      let missing = false;
      try { await fs.access(absPath); } catch { missing = true; }
      return { ...item, path: missing ? undefined : absPath, missing };
    }),
  );

  res.json({
    outputName: session.outputName,
    tocEnabled: session.tocEnabled,
    assemblyItems,
    tocItems: session.tocItems,
  });
});

// ── Static serving (production) ────────────────────────────────────────────

if (process.env.NODE_ENV === 'production') {
  const distDir = path.join(__dirname, '..', '..', 'dist');
  app.use(express.static(distDir));
  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

// ── Global JSON error handler — prevents Express sending HTML on 500 ────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err.message ?? 'Internal server error' });
});

// ── Start ──────────────────────────────────────────────────────────────────

app.listen(PORT, async () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\nPDF Assembler running at ${url}`);
  console.log(`Scanning: ${CWD}\n`);

  // Warm up Chrome now so the first build is fast
  initBrowser().catch(err =>
    console.warn('Chrome warm-up failed (separator pages will launch Chrome on demand):', err.message),
  );

  // Auto-open browser in production
  if (process.env.NODE_ENV === 'production') {
    try {
      const { default: open } = await import('open');
      await open(url);
    } catch {
      // Non-fatal
    }
  }
});
