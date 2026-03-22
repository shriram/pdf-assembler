import fs from 'fs/promises';
import path from 'path';
import type { ScannedFile, FileType } from '../src/types.js';

const PDF_EXTS      = new Set(['.pdf']);
const IMAGE_EXTS    = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);
const RENDERABLE_EXTS = new Set(['.md', '.markdown', '.txt']);

// Directories to skip when recursing
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'dist-server', '.DS_Store',
]);

const README_PATTERN = /^(readme|cover)(\.|$)/i; // case-insensitive

function classifyFile(name: string): FileType | null {
  const ext  = path.extname(name).toLowerCase();
  const base = path.basename(name, ext);

  // readme/cover files are recognised regardless of extension
  if (README_PATTERN.test(name)) return 'readme';

  if (PDF_EXTS.has(ext))        return 'pdf';
  if (IMAGE_EXTS.has(ext))      return 'image';
  if (RENDERABLE_EXTS.has(ext)) return 'pdf'; // rendered to PDF at build time
  return null;
}

const TYPE_ORDER: Record<FileType, number> = { readme: 0, pdf: 1, image: 2 };

async function scanRecursive(
  dir: string,
  rootDir: string,
  results: ScannedFile[],
): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return; // unreadable directory — skip silently
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue; // skip hidden

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await scanRecursive(path.join(dir, entry.name), rootDir, results);
    } else if (entry.isFile()) {
      const type = classifyFile(entry.name);
      if (!type) continue;
      const absPath = path.join(dir, entry.name);
      const relPath = path.relative(rootDir, absPath);
      const relDir = path.relative(rootDir, dir);
      const ext = path.extname(entry.name).toLowerCase();
      const embeddable = PDF_EXTS.has(ext) || IMAGE_EXTS.has(ext) || RENDERABLE_EXTS.has(ext);
      results.push({
        name: entry.name,
        type,
        path: absPath,
        relativePath: relPath,
        directory: relDir,
        embeddable,
      });
    }
  }
}

export async function scanDirectory(dir: string): Promise<ScannedFile[]> {
  const results: ScannedFile[] = [];
  await scanRecursive(dir, dir, results);

  results.sort((a, b) => {
    // readme files always first, regardless of directory
    if (a.type !== b.type) return TYPE_ORDER[a.type] - TYPE_ORDER[b.type];
    // then sort by full relative path alphabetically
    return a.relativePath.localeCompare(b.relativePath);
  });

  return results;
}
