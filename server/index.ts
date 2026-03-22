import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { scanDirectory } from './scanner.js';
import { buildPdf } from './pdf-builder.js';
import { initBrowser } from './separator.js';
import type { BuildRequest } from '../src/types.js';

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
  const result = await buildPdf(body, CWD);
  res.json(result);
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
