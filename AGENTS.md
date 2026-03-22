# Agent Notes

## Architecture

**Server** (`server/`) — Express 5, ESM, port 3001 by default. Reads `--port` and `--cwd` from argv.
- `index.ts` — routes + startup (launches Chrome, opens browser)
- `scanner.ts` — flat+recursive scan of the target directory for PDFs/images/markdown
- `pdf-builder.ts` — orchestrates the full build: two-pass page counting, file merging, image embedding, separator rendering
- `separator.ts` — puppeteer-core singleton; renders separator pages (screenshot→PNG) and markdown files (page.pdf()) via Chrome
- `toc-builder.ts` — builds TOC pages using pdf-lib text primitives + NotoSans font

**Client** (`src/`) — React 18 + Vite, dnd-kit for drag-and-drop.
- `types.ts` is shared between server and client — change carefully
- State lives entirely in `App.tsx`; components are mostly presentational
- In dev, Vite proxies `/api/*` to `:3001`

## Key design decisions

**puppeteer-core, not puppeteer** — avoids the ~300MB bundled Chromium download. Points at system Chrome (`/Applications/Google Chrome.app/...`), configurable via `CHROME_EXECUTABLE_PATH`.

**Chrome singleton** — browser launches once at server startup (`initBrowser()` in `separator.ts`), stays alive. Don't launch per-request.

**Two-pass TOC** — page numbers aren't known until all files are processed. Pass 1 builds the doc and records `id→startPage` in a map. Pass 2 inserts TOC pages at index 0 and shifts all page numbers by the TOC page count.

**Font for TOC: NotoSans static TTF** — pdf-lib's fontkit doesn't support variable fonts. The font in `server/assets/` must be a static (non-variable) TTF. If you swap fonts, verify with `file font.ttf` that it's not a variable font. The build script copies `server/assets/` to `dist-server/server/assets/` — if you add assets, they'll be picked up automatically.

**Markdown rendering** — uses `marked` to convert to HTML, then puppeteer's `page.pdf()` (not screenshot) so long READMEs paginate naturally.

**GIF/WebP** — pdf-lib only embeds JPEG and PNG natively. GIF/WebP items are skipped with a warning added to `BuildResponse.warnings`. The client surfaces these after build.

**`"type": "module"`** — the whole project is ESM. No `require()`, no `__dirname` (use `import.meta.dirname`).

## Build

```bash
npm run build
# = vite build && tsc -p tsconfig.json && rm -rf dist-server/server/assets && cp -r server/assets dist-server/server/assets
```

Server output → `dist-server/`, client output → `dist/`. The `run` shell script always points at `dist-server/server/index.js`.

## Common pitfalls

- **"Unknown font format"** — you have a variable font in `server/assets/`. Replace with a static TTF.
- **500 on build with HTML response** — the server threw and Express returned its HTML error page; the client tries to parse it as JSON and fails. Check the server terminal for the real error.
- **Files not appearing in picker** — scanner skips `node_modules`, `.git`, hidden directories, and `dist*` folders. It only surfaces `.pdf`, `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.md`, and `readme.*`/`cover.*` files.
- **Separator takes ~3s** — that's Chrome rendering time. It's fast after the first one per session since the browser stays warm.
- **Badge color inconsistency** — FilePicker uses `file.type` for color; SortableItem uses `item.kind`. If they diverge, check both `TYPE_COLOR` in FilePicker and the color logic in SortableItem.
