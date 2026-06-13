import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { TocItem } from '../src/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Resolve the fonts directory at call time so it works whether this module runs
// from the built tree (dist-server/server/, fonts two levels up in the source
// server/assets/) or straight from source via tsx (server/, fonts in ./assets/).
const ASSET_DIR_CANDIDATES = [
  path.join(__dirname, '..', '..', 'server', 'assets'), // built: prefer source fonts
  path.join(__dirname, 'assets'),                       // source run, or built copy
];

async function resolveFontPath(file: string): Promise<string> {
  for (const dir of ASSET_DIR_CANDIDATES) {
    const candidate = path.join(dir, file);
    try { await fs.access(candidate); return candidate; } catch { /* try next */ }
  }
  // Fall back to the first candidate so the error message is meaningful.
  return path.join(ASSET_DIR_CANDIDATES[0], file);
}

// US Letter points
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 72; // 1 inch
const CONTENT_W = PAGE_W - MARGIN * 2;

const TITLE_SIZE = 24;
const ENTRY_SIZE = 12;
const LEADING = 20;
const TITLE_GAP = 36; // space between title and first entry

// Clamp to ASCII+Latin printable range for NotoSans (emoji are dropped)
function sanitizeLabel(label: string): string {
  // Remove emoji and other non-NotoSans characters by filtering to BMP
  // NotoSans covers Latin, Cyrillic, Greek, CJK basics — emoji are dropped
  return [...label]
    .filter(ch => {
      const cp = ch.codePointAt(0) ?? 0;
      // Drop emoji ranges (most emoji are 0x1F000+) but keep BMP text
      return cp < 0x1F000 || (cp >= 0x20000 && cp < 0xE0000);
    })
    .join('');
}

export async function buildTocPages(
  doc: PDFDocument,
  tocItems: TocItem[],
  pageMap: Map<string, number>,
): Promise<void> {
  doc.registerFontkit(fontkit);

  const fontBytes = await fs.readFile(await resolveFontPath('NotoSans-Regular.ttf'));
  const boldBytes = await fs.readFile(await resolveFontPath('NotoSans-Bold.ttf')).catch(() => fontBytes);

  const font = await doc.embedFont(fontBytes, { subset: true });
  const boldFont = await doc.embedFont(boldBytes, { subset: true });

  const dotW = font.widthOfTextAtSize('.', ENTRY_SIZE);
  const dark = rgb(0.1, 0.1, 0.18); // #1a1a2e

  // Build list of entries that have a page number
  const entries = tocItems
    .map(item => ({
      label: sanitizeLabel(item.label),
      page: pageMap.get(item.id) ?? null,
    }))
    .filter(e => e.label.length > 0);

  let pageIndex = 0; // TOC pages will be inserted at front; tracked separately
  let y = PAGE_H - MARGIN - TITLE_SIZE;
  let currentPage = doc.insertPage(0, [PAGE_W, PAGE_H]);
  pageIndex++;

  // Draw title
  currentPage.drawText('Table of Contents', {
    x: MARGIN,
    y,
    size: TITLE_SIZE,
    font: boldFont,
    color: dark,
  });
  y -= TITLE_SIZE + TITLE_GAP;

  for (const entry of entries) {
    // Need room for at least one entry
    if (y < MARGIN + ENTRY_SIZE) {
      currentPage = doc.insertPage(pageIndex, [PAGE_W, PAGE_H]);
      pageIndex++;
      y = PAGE_H - MARGIN - ENTRY_SIZE;
    }

    const pageNumStr = entry.page != null ? String(entry.page) : '—';
    const labelW = font.widthOfTextAtSize(entry.label, ENTRY_SIZE);
    const pageNumW = font.widthOfTextAtSize(pageNumStr, ENTRY_SIZE);
    const gap = 8;
    const available = CONTENT_W - labelW - pageNumW - gap;
    const dotCount = Math.max(3, Math.floor(available / dotW));
    const dots = '.'.repeat(dotCount);

    currentPage.drawText(entry.label, {
      x: MARGIN,
      y,
      size: ENTRY_SIZE,
      font,
      color: dark,
    });
    currentPage.drawText(dots, {
      x: MARGIN + labelW + gap / 2,
      y,
      size: ENTRY_SIZE,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });
    currentPage.drawText(pageNumStr, {
      x: PAGE_W - MARGIN - pageNumW,
      y,
      size: ENTRY_SIZE,
      font,
      color: dark,
    });

    y -= LEADING;
  }

  // Return how many TOC pages were inserted
  return; // caller knows because pageMap values need adjustment
}

export function getTocPageCount(tocItems: TocItem[]): number {
  // Estimate: title takes one slot, then entries at LEADING each
  const usableH = PAGE_H - MARGIN * 2 - TITLE_SIZE - TITLE_GAP;
  const entriesPerPage = Math.floor(usableH / LEADING);
  if (tocItems.length === 0) return 0;
  return Math.ceil(tocItems.length / entriesPerPage);
}
