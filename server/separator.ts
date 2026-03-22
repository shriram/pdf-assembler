import puppeteer from 'puppeteer-core';
import type { Browser } from 'puppeteer-core';
import { tmpdir } from 'os';
import { writeFile, unlink, readFile } from 'fs/promises';
import { randomBytes } from 'crypto';
import { marked } from 'marked';

const CHROME_PATH =
  process.env.CHROME_EXECUTABLE_PATH ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// US Letter at 96 dpi
const VIEWPORT = { width: 816, height: 1056 };

// Singleton browser — launched once at server startup, reused across all builds
let sharedBrowser: Browser | null = null;

export async function initBrowser(): Promise<void> {
  console.log('Launching Chrome for separator rendering…');
  sharedBrowser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    headless: true,
  });
  console.log('Chrome ready.');
}

export async function getBrowser(): Promise<Browser> {
  if (!sharedBrowser || !sharedBrowser.connected) {
    await initBrowser();
  }
  return sharedBrowser!;
}

export async function closeBrowser(): Promise<void> {
  if (sharedBrowser) {
    await sharedBrowser.close();
    sharedBrowser = null;
  }
}

function buildHtml(text: string): string {
  const json = JSON.stringify(text);
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: ${VIEWPORT.width}px;
    height: ${VIEWPORT.height}px;
    background: #ffffff;
    overflow: hidden;
  }
  #container {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    padding: 72px;
  }
  #text {
    font-family: system-ui, -apple-system, 'Apple Color Emoji', 'Segoe UI Emoji',
                 'Noto Color Emoji', sans-serif;
    font-size: 48px;
    font-weight: 600;
    color: #1a1a2e;
    text-align: center;
    white-space: pre-wrap;
    line-height: 1.3;
    word-break: break-word;
  }
</style>
</head>
<body>
<div id="container"><div id="text"></div></div>
<script>
  document.getElementById('text').textContent = ${json};
</script>
</body>
</html>`;
}

// Render a markdown file to a multi-page PDF buffer via puppeteer
export async function renderMarkdownFile(filePath: string): Promise<Buffer> {
  const mdContent = await readFile(filePath, 'utf-8');
  const bodyHtml = await marked(mdContent);
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 12px;
    line-height: 1.6;
    color: #1a1a2e;
    padding: 72px;
  }
  h1 { font-size: 26px; margin-top: 1.2em; margin-bottom: 0.4em; border-bottom: 2px solid #1a1a2e; padding-bottom: 6px; }
  h2 { font-size: 20px; margin-top: 1.2em; margin-bottom: 0.4em; }
  h3 { font-size: 15px; margin-top: 1em; margin-bottom: 0.3em; }
  p { margin: 0.7em 0; }
  ul, ol { margin: 0.5em 0 0.5em 1.5em; }
  li { margin: 0.2em 0; }
  code { background: #f0f0f0; padding: 1px 4px; border-radius: 3px; font-size: 11px; font-family: monospace; }
  pre { background: #f0f0f0; padding: 12px; border-radius: 4px; margin: 0.7em 0; }
  pre code { background: none; padding: 0; }
  blockquote { border-left: 3px solid #ccc; padding-left: 12px; color: #555; margin: 0.7em 0; }
  table { border-collapse: collapse; width: 100%; margin: 0.7em 0; }
  td, th { border: 1px solid #ddd; padding: 6px 8px; }
  th { background: #f0f0f0; font-weight: 700; }
  img { max-width: 100%; }
  hr { border: none; border-top: 1px solid #ddd; margin: 1em 0; }
</style>
</head>
<body>${bodyHtml}</body>
</html>`;

  const browser = await getBrowser();
  const page = await browser.newPage();
  const tmpFile = `${tmpdir()}/pdfgen-md-${randomBytes(8).toString('hex')}.html`;
  await writeFile(tmpFile, html, 'utf-8');
  try {
    await page.goto(`file://${tmpFile}`, { waitUntil: 'domcontentloaded', timeout: 10000 });
    const pdfBytes = await page.pdf({
      width: '8.5in',
      height: '11in',
      margin: { top: '0', bottom: '0', left: '0', right: '0' },
      printBackground: true,
    });
    return Buffer.from(pdfBytes);
  } finally {
    await page.close();
    unlink(tmpFile).catch(() => {});
  }
}

export async function renderSeparatorPage(text: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  // Write HTML to a temp file and navigate via file:// — much more reliable
  // than page.setContent() which can hang on load/networkidle events.
  const tmpFile = `${tmpdir()}/pdfgen-sep-${randomBytes(8).toString('hex')}.html`;
  await writeFile(tmpFile, buildHtml(text), 'utf-8');
  try {
    await page.setViewport(VIEWPORT);
    await page.goto(`file://${tmpFile}`, { waitUntil: 'domcontentloaded', timeout: 10000 });
    const screenshot = await page.screenshot({ type: 'png', fullPage: false });
    return Buffer.from(screenshot);
  } finally {
    await page.close();
    unlink(tmpFile).catch(() => {});
  }
}
