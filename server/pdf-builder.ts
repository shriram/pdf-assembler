import fs from 'fs/promises';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import { renderSeparatorPage, renderMarkdownFile } from './separator.js';
import { buildTocPages, getTocPageCount } from './toc-builder.js';
import type { AssemblyItem, BuildRequest, BuildResponse, TocItem } from '../src/types.js';

// US Letter
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 72; // 1 inch in points

function sanitizeOutputName(name: string): string {
  const safe = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, '_');
  return safe.endsWith('.pdf') ? safe : safe + '.pdf';
}

async function embedImagePage(
  doc: PDFDocument,
  filePath: string,
  scale: number,
  warnings: string[],
): Promise<void> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.gif' || ext === '.webp') {
    warnings.push(`Skipped ${path.basename(filePath)}: GIF and WebP are not supported. Convert to PNG or JPG first.`);
    return;
  }

  const bytes = await fs.readFile(filePath);
  let image;
  try {
    if (ext === '.jpg' || ext === '.jpeg') {
      image = await doc.embedJpg(bytes);
    } else {
      image = await doc.embedPng(bytes);
    }
  } catch (err) {
    warnings.push(`Skipped ${path.basename(filePath)}: could not embed image (${String(err)})`);
    return;
  }

  const maxW = PAGE_W - MARGIN * 2;
  const maxH = PAGE_H - MARGIN * 2;

  // Scale image to fit within margins at user-chosen scale, preserving aspect ratio
  let dims = image.scaleToFit(maxW * scale, maxH * scale);

  const x = MARGIN + (maxW - dims.width) / 2;
  const y = MARGIN + (maxH - dims.height) / 2;

  const page = doc.addPage([PAGE_W, PAGE_H]);
  page.drawImage(image, { x, y, width: dims.width, height: dims.height });
}

async function embedSeparatorPage(
  doc: PDFDocument,
  text: string,
  warnings: string[],
): Promise<void> {
  let pngBuffer: Buffer;
  try {
    pngBuffer = await renderSeparatorPage(text);
  } catch (err) {
    warnings.push(`Could not render separator "${text.slice(0, 30)}": ${String(err)}`);
    return;
  }

  const image = await doc.embedPng(pngBuffer);
  const page = doc.addPage([PAGE_W, PAGE_H]);
  // Fill page exactly (separator is rendered at Letter proportions)
  page.drawImage(image, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
}

async function mergePdf(
  doc: PDFDocument,
  filePath: string,
  warnings: string[],
): Promise<number> {
  let bytes: Buffer;
  try {
    bytes = await fs.readFile(filePath);
  } catch (err) {
    warnings.push(`Skipped ${path.basename(filePath)}: could not read file`);
    return 0;
  }

  let src: PDFDocument;
  try {
    src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  } catch (err) {
    warnings.push(`Skipped ${path.basename(filePath)}: invalid or unreadable PDF`);
    return 0;
  }

  try {
    const copiedPages = await doc.copyPages(src, src.getPageIndices());
    for (const page of copiedPages) doc.addPage(page);
    return copiedPages.length;
  } catch (err) {
    warnings.push(`Skipped ${path.basename(filePath)}: could not copy pages (${String(err)})`);
    return 0;
  }
}

export async function buildPdf(
  { items, tocItems, outputName }: BuildRequest,
  cwd: string,
): Promise<BuildResponse> {
  const warnings: string[] = [];
  const filename = sanitizeOutputName(outputName || 'output.pdf');
  const outPath = path.join(cwd, filename);

  const doc = await PDFDocument.create();

  // Chrome is kept warm by the server; getBrowser() is called inside renderSeparatorPage

  // Pass 1: assemble pages, build pageMap (1-based, before TOC insertion)
  const pageMap = new Map<string, number>();
  let pageCounter = 0;

  for (const item of items) {
    pageMap.set(item.id, pageCounter + 1);

    if (item.kind === 'pdf' && item.path) {
      const ext = path.extname(item.path).toLowerCase();
      let added = 0;
      if (ext === '.md' || ext === '.markdown') {
        // Render markdown via puppeteer → merge resulting PDF
        try {
          const pdfBytes = await renderMarkdownFile(item.path);
          const mdDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
          const copied = await doc.copyPages(mdDoc, mdDoc.getPageIndices());
          for (const p of copied) doc.addPage(p);
          added = copied.length;
        } catch (err) {
          warnings.push(`Skipped ${path.basename(item.path)}: could not render markdown (${String(err)})`);
        }
      } else {
        added = await mergePdf(doc, item.path, warnings);
      }
      pageCounter += added;
    } else if (item.kind === 'image' && item.path) {
      const before = doc.getPageCount();
      await embedImagePage(doc, item.path, item.scale ?? 1.0, warnings);
      pageCounter += doc.getPageCount() - before;
    } else if (item.kind === 'separator') {
      const text = item.separatorText || item.label || 'Section';
      await embedSeparatorPage(doc, text, warnings);
      pageCounter += 1;
    }
  }

  // Pass 2: insert TOC at front if requested
  if (tocItems.length > 0) {
    // We need to insert TOC pages at index 0. buildTocPages inserts them.
    // First figure out how many pages the TOC will occupy.
    const tocPageCount = getTocPageCount(tocItems);

    // Adjust pageMap: shift all values by tocPageCount
    for (const [id, pg] of pageMap) {
      pageMap.set(id, pg + tocPageCount);
    }

    // Insert TOC pages (they go at index 0..tocPageCount-1)
    await buildTocPages(doc, tocItems, pageMap);
  }

  const pdfBytes = await doc.save();
  await fs.writeFile(outPath, pdfBytes);

  return {
    filename,
    pageCount: doc.getPageCount(),
    warnings,
  };
}
