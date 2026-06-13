import fs from 'fs/promises';
import path from 'path';
import readline from 'readline';
import { nanoid } from 'nanoid';
import { scanDirectory } from '../server/scanner.js';
import { buildPdf } from '../server/pdf-builder.js';
import { closeBrowser } from '../server/separator.js';
import type {
  ScannedFile,
  AssemblyItem,
  TocItem,
  SessionFile,
  SessionMeta,
} from '../src/types.js';
import * as a from './ansi.js';

// ── Key event shape from readline's keypress emitter ────────────────────────
interface Key {
  sequence?: string;
  name?: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
}

type Mode = 'list' | 'addFile' | 'prompt' | 'sessions' | 'help' | 'confirmQuit';

// A pending text prompt: title shown to the user + what to do with the result.
interface Prompt {
  title: string;
  value: string;
  onSubmit: (value: string) => void | Promise<void>;
}

export class TuiApp {
  private readonly scanDir: string;
  private scanned: ScannedFile[] = [];
  private items: AssemblyItem[] = [];
  private tocEnabled = false;
  private outputName = 'output.pdf';

  private mode: Mode = 'list';
  private cursor = 0; // index into items (list mode)
  private dirty = false;
  private status = '';
  private warnings: string[] = [];

  // addFile overlay state
  private fileFilter = '';
  private fileCursor = 0;

  // session loader state
  private sessions: SessionMeta[] = [];
  private sessionCursor = 0;

  // active prompt
  private prompt: Prompt | null = null;

  private out = process.stdout;
  private resolveExit: (() => void) | null = null;

  constructor(scanDir: string) {
    this.scanDir = scanDir;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  async run(): Promise<void> {
    await this.rescan(true);
    await this.refreshSessions();

    this.out.write(a.enterAltScreen + a.hideCursor);
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.resume();

    const onKey = (str: string | undefined, key: Key) => {
      this.handleKey(str ?? '', key ?? {});
    };
    const onResize = () => this.render();
    process.stdin.on('keypress', onKey);
    this.out.on('resize', onResize);

    this.render();

    await new Promise<void>(resolve => { this.resolveExit = resolve; });

    process.stdin.off('keypress', onKey);
    this.out.off('resize', onResize);
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    process.stdin.pause();
    this.out.write(a.showCursor + a.leaveAltScreen);
    await closeBrowser().catch(() => {});
  }

  private quit(): void {
    if (this.resolveExit) this.resolveExit();
  }

  // ── Data ──────────────────────────────────────────────────────────────────
  private async rescan(autoSeedReadme = false): Promise<void> {
    this.scanned = await scanDirectory(this.scanDir);
    if (autoSeedReadme) {
      // Mirror the web app: readme/cover files are pre-added at the top, no TOC.
      this.items = this.scanned
        .filter(f => f.type === 'readme')
        .map(f => ({
          id: nanoid(),
          kind: 'pdf' as const,
          label: f.directory ? f.relativePath : f.name,
          path: f.path,
          includeInToc: false,
          enabled: true,
        }));
    } else {
      // Reconcile already-added items against what's actually on disk now.
      await this.revalidateItems();
    }
  }

  // Re-check each added item's file: flag the ones that have been renamed or
  // deleted (cleared again if the file reappears on a later rescan).
  private async revalidateItems(): Promise<void> {
    await Promise.all(this.items.map(async item => {
      if (!item.path) return; // separators have no backing file
      try {
        await fs.access(item.path);
        item.missing = false;
      } catch {
        item.missing = true;
      }
    }));
  }

  private async refreshSessions(): Promise<void> {
    try {
      const entries = await fs.readdir(this.scanDir, { withFileTypes: true });
      const found: SessionMeta[] = [];
      for (const e of entries) {
        if (e.isFile() && e.name.endsWith('.pdfasm')) {
          const stat = await fs.stat(path.join(this.scanDir, e.name));
          found.push({ filename: e.name, savedAt: stat.mtime.toISOString() });
        }
      }
      found.sort((x, y) => y.savedAt.localeCompare(x.savedAt));
      this.sessions = found;
    } catch {
      this.sessions = [];
    }
  }

  // Files available to add — those not skipped, honouring the live filter.
  private filteredFiles(): ScannedFile[] {
    const q = this.fileFilter.toLowerCase();
    return this.scanned.filter(f => !q || f.relativePath.toLowerCase().includes(q));
  }

  // ── Key dispatch ──────────────────────────────────────────────────────────
  private handleKey(str: string, key: Key): void {
    if (key.ctrl && key.name === 'c') { this.quit(); return; }

    switch (this.mode) {
      case 'list': this.keyList(str, key); break;
      case 'addFile': this.keyAddFile(str, key); break;
      case 'prompt': this.keyPrompt(str, key); break;
      case 'sessions': this.keySessions(str, key); break;
      case 'help': this.mode = 'list'; break;
      case 'confirmQuit': this.keyConfirmQuit(str); break;
    }
    this.render();
  }

  private keyList(str: string, key: Key): void {
    const n = this.items.length;
    const item = this.items[this.cursor];
    switch (key.name) {
      case 'up': this.cursor = Math.max(0, this.cursor - 1); return;
      case 'down': this.cursor = Math.min(n - 1, this.cursor + 1); return;
      case 'return': if (item) this.editLabel(item); return;
      case 'space': if (item) { item.enabled = item.enabled === false; this.markDirty(); } return;
      case 'backspace':
      case 'delete': if (item) this.removeItem(); return;
    }
    switch (str) {
      case 'k': this.cursor = Math.max(0, this.cursor - 1); break;
      case 'j': this.cursor = Math.min(n - 1, this.cursor + 1); break;
      case 'K': this.moveItem(-1); break;
      case 'J': this.moveItem(1); break;
      case 'a': void this.openAddFile(); break;
      case 's': this.addSeparator(); break;
      case 'e': if (item) this.editLabel(item); break;
      case 'x': case 'd': if (item) this.removeItem(); break;
      case 't': if (item) { item.includeInToc = !item.includeInToc; this.markDirty(); } break;
      case 'T': this.tocEnabled = !this.tocEnabled; this.markDirty(); break;
      case '+': case '=': this.scaleItem(0.1); break;
      case '-': case '_': this.scaleItem(-0.1); break;
      case 'o': this.editOutputName(); break;
      case 'b': void this.build(); break;
      case 'w': this.saveSessionPrompt(); break;
      case 'l': this.openSessions(); break;
      case 'r': void this.rescan().then(() => {
        const missing = this.items.filter(i => i.missing).length;
        this.status = missing ? `Rescanned — ${missing} added file(s) now missing (red).` : 'Rescanned folder.';
        this.render();
      }); break;
      case '?': this.mode = 'help'; break;
      case 'q': this.tryQuit(); break;
    }
  }

  private keyAddFile(str: string, key: Key): void {
    const list = this.filteredFiles();
    if (key.name === 'escape') { this.mode = 'list'; return; }
    if (key.name === 'up') { this.fileCursor = Math.max(0, this.fileCursor - 1); return; }
    if (key.name === 'down') { this.fileCursor = Math.min(list.length - 1, this.fileCursor + 1); return; }
    if (key.name === 'return') {
      const file = list[this.fileCursor];
      if (file) this.addFile(file);
      return;
    }
    if (key.name === 'backspace') {
      this.fileFilter = this.fileFilter.slice(0, -1);
      this.fileCursor = 0;
      return;
    }
    if (str && str.length === 1 && !key.ctrl && !key.meta && str >= ' ') {
      this.fileFilter += str;
      this.fileCursor = 0;
    }
  }

  private keyPrompt(str: string, key: Key): void {
    if (!this.prompt) { this.mode = 'list'; return; }
    if (key.name === 'escape') { this.prompt = null; this.mode = 'list'; return; }
    if (key.name === 'return') {
      const p = this.prompt;
      this.prompt = null;
      this.mode = 'list';
      void p.onSubmit(p.value);
      return;
    }
    if (key.name === 'backspace') { this.prompt.value = this.prompt.value.slice(0, -1); return; }
    if (str && str.length === 1 && !key.ctrl && !key.meta && str >= ' ') {
      this.prompt.value += str;
    }
  }

  private keySessions(_str: string, key: Key): void {
    if (key.name === 'escape') { this.mode = 'list'; return; }
    if (key.name === 'up') { this.sessionCursor = Math.max(0, this.sessionCursor - 1); return; }
    if (key.name === 'down') { this.sessionCursor = Math.min(this.sessions.length - 1, this.sessionCursor + 1); return; }
    if (key.name === 'return') {
      const s = this.sessions[this.sessionCursor];
      if (s) void this.loadSession(s.filename);
    }
  }

  private keyConfirmQuit(str: string): void {
    if (str === 'y' || str === 'Y') { this.quit(); return; }
    this.mode = 'list';
  }

  // ── Actions ─────────────────────────────────────────────────────────────
  private markDirty(): void { this.dirty = true; }

  private moveItem(delta: number): void {
    const to = this.cursor + delta;
    if (to < 0 || to >= this.items.length) return;
    const [it] = this.items.splice(this.cursor, 1);
    this.items.splice(to, 0, it);
    this.cursor = to;
    this.markDirty();
  }

  private removeItem(): void {
    this.items.splice(this.cursor, 1);
    this.cursor = Math.max(0, Math.min(this.cursor, this.items.length - 1));
    this.markDirty();
  }

  private scaleItem(delta: number): void {
    const item = this.items[this.cursor];
    if (!item || item.kind !== 'image') return;
    const cur = item.scale ?? 1.0;
    item.scale = Math.round(Math.min(1.0, Math.max(0.5, cur + delta)) * 10) / 10;
    this.markDirty();
  }

  private addFile(file: ScannedFile): void {
    const item: AssemblyItem = {
      id: nanoid(),
      kind: file.type === 'image' ? 'image' : 'pdf',
      label: file.directory ? file.relativePath : file.name,
      path: file.path,
      includeInToc: true,
      enabled: true,
      scale: file.type === 'image' ? 1.0 : undefined,
    };
    this.items.push(item);
    this.cursor = this.items.length - 1;
    this.markDirty();
    this.status = `Added ${item.label}`;
  }

  private addSeparator(): void {
    this.prompt = {
      title: 'Separator text (shown big & centred on its own page)',
      value: '',
      onSubmit: (value) => {
        const text = value.trim() || 'Section';
        const item: AssemblyItem = {
          id: nanoid(),
          kind: 'separator',
          label: text,
          separatorText: text,
          includeInToc: true,
          enabled: true,
        };
        const at = this.items.length ? this.cursor + 1 : 0;
        this.items.splice(at, 0, item);
        this.cursor = at;
        this.markDirty();
      },
    };
    this.mode = 'prompt';
  }

  private editLabel(item: AssemblyItem): void {
    const isSep = item.kind === 'separator';
    this.prompt = {
      title: isSep ? 'Edit separator text' : 'Edit label (also used in the table of contents)',
      value: item.label,
      onSubmit: (value) => {
        const v = value.trim();
        if (!v) return;
        item.label = v;
        if (isSep) item.separatorText = v;
        this.markDirty();
      },
    };
    this.mode = 'prompt';
  }

  private editOutputName(): void {
    this.prompt = {
      title: 'Output filename',
      value: this.outputName,
      onSubmit: (value) => {
        const v = value.trim();
        if (v) { this.outputName = v.endsWith('.pdf') ? v : v + '.pdf'; this.markDirty(); }
      },
    };
    this.mode = 'prompt';
  }

  private async openAddFile(): Promise<void> {
    // Re-read the folder so renamed/new/deleted files are picked up, and flag
    // any already-added items whose files have since disappeared.
    await this.rescan();
    if (this.scanned.length === 0) { this.status = 'No files found in this folder.'; this.render(); return; }
    this.fileFilter = '';
    this.fileCursor = 0;
    this.mode = 'addFile';
    const missing = this.items.filter(i => i.missing).length;
    this.status = missing
      ? `${missing} added file(s) are missing from disk (shown in red).`
      : '';
    this.render();
  }

  private openSessions(): void {
    void this.refreshSessions().then(() => {
      if (this.sessions.length === 0) { this.status = 'No .pdfasm sessions in this folder.'; this.render(); return; }
      this.sessionCursor = 0;
      this.mode = 'sessions';
      this.render();
    });
  }

  private tryQuit(): void {
    if (this.dirty) { this.mode = 'confirmQuit'; return; }
    this.quit();
  }

  // Build the TOC entry list from items the user flagged for inclusion.
  private buildTocItems(): TocItem[] {
    if (!this.tocEnabled) return [];
    return this.items
      .filter(i => i.includeInToc)
      .map(i => ({ id: i.id, label: i.label }));
  }

  private async build(): Promise<void> {
    if (this.items.length === 0) { this.status = 'Nothing to build — add some files first.'; return; }
    this.status = 'Building PDF… (launching Chrome if needed)';
    this.warnings = [];
    this.render();
    try {
      const result = await buildPdf(
        { items: this.items, tocItems: this.buildTocItems(), outputName: this.outputName },
        this.scanDir,
      );
      this.warnings = result.warnings ?? [];
      const full = path.join(this.scanDir, result.filename);
      this.status = `Built ${result.pageCount} page(s) → ${full}`;
      await this.rescan(); // pick up the new file in the listing
      try {
        const { default: open } = await import('open');
        await open(full);
      } catch { /* opening is best-effort */ }
    } catch (err) {
      this.status = `Build failed: ${err instanceof Error ? err.message : String(err)}`;
    }
    this.render();
  }

  private saveSessionPrompt(): void {
    this.prompt = {
      title: 'Save session as (.pdfasm)',
      value: this.outputName.replace(/\.pdf$/i, ''),
      onSubmit: (value) => this.saveSession(value),
    };
    this.mode = 'prompt';
  }

  private async saveSession(rawName: string): Promise<void> {
    const safe = path.basename(rawName.trim() || 'session').replace(/[^a-zA-Z0-9._-]/g, '_');
    const finalName = safe.endsWith('.pdfasm') ? safe : `${safe}.pdfasm`;
    const session: SessionFile = {
      version: 1,
      savedAt: new Date().toISOString(),
      outputName: this.outputName,
      tocEnabled: this.tocEnabled,
      items: this.items.map(item => {
        const entry: SessionFile['items'][number] = {
          id: item.id,
          kind: item.kind,
          label: item.label,
          enabled: item.enabled,
          includeInToc: item.includeInToc,
        };
        if (item.path) entry.relativePath = path.relative(this.scanDir, item.path);
        if (item.scale !== undefined) entry.scale = item.scale;
        if (item.separatorText !== undefined) entry.separatorText = item.separatorText;
        return entry;
      }),
      tocItems: this.buildTocItems(),
      collapsedDirs: [],
    };
    try {
      await fs.writeFile(path.join(this.scanDir, finalName), JSON.stringify(session, null, 2), 'utf-8');
      this.dirty = false;
      this.status = `Saved session → ${finalName}`;
      await this.refreshSessions();
    } catch (err) {
      this.status = `Save failed: ${err instanceof Error ? err.message : String(err)}`;
    }
    this.render();
  }

  private async loadSession(filename: string): Promise<void> {
    try {
      const raw = await fs.readFile(path.join(this.scanDir, filename), 'utf-8');
      const session = JSON.parse(raw) as SessionFile;
      const items: AssemblyItem[] = [];
      for (const it of session.items) {
        if (!it.relativePath) { // separator
          items.push({
            id: it.id, kind: it.kind, label: it.label, enabled: it.enabled,
            includeInToc: it.includeInToc, separatorText: it.separatorText, missing: false,
          });
          continue;
        }
        const abs = path.join(this.scanDir, it.relativePath);
        let missing = false;
        try { await fs.access(abs); } catch { missing = true; }
        items.push({
          id: it.id, kind: it.kind, label: it.label, enabled: it.enabled,
          includeInToc: it.includeInToc, scale: it.scale,
          path: missing ? undefined : abs, missing,
        });
      }
      this.items = items;
      this.tocEnabled = session.tocEnabled;
      this.outputName = session.outputName;
      this.cursor = 0;
      this.dirty = false;
      this.mode = 'list';
      const missingCount = items.filter(i => i.missing).length;
      this.status = `Loaded ${filename}` + (missingCount ? ` — ${missingCount} file(s) now missing` : '');
    } catch (err) {
      this.status = `Load failed: ${err instanceof Error ? err.message : String(err)}`;
      this.mode = 'list';
    }
    this.render();
  }

  // ── Rendering ─────────────────────────────────────────────────────────────
  private render(): void {
    // Clamp to a sane minimum: a 0-width terminal (e.g. a detached pty) must
    // never produce negative widths that would throw in '─'.repeat(...).
    const cols = Math.max(40, this.out.columns || 80);
    const rows = Math.max(10, this.out.rows || 24);
    const lines: string[] = [];

    // Header
    const toc = this.tocEnabled ? a.green('TOC on') : a.gray('TOC off');
    const dirtyMark = this.dirty ? a.yellow(' ●') : '';
    lines.push(
      a.bold(a.cyan(' PDF Assembler ')) +
      a.gray('— ') + a.dim(this.scanDir),
    );
    lines.push(
      ' ' + a.gray('output: ') + a.white(this.outputName) +
      a.gray('   ') + toc +
      a.gray('   items: ') + String(this.items.length) + dirtyMark,
    );
    lines.push(a.gray(' ' + '─'.repeat(Math.max(0, cols - 2))));

    // Body — depends on mode (the list is always the backdrop)
    const bodyHeight = rows - lines.length - 4; // reserve footer
    this.renderList(lines, cols, bodyHeight);

    // Warnings (if any) just above the footer
    if (this.warnings.length > 0) {
      lines.push(a.yellow(' ⚠ ' + a.truncate(this.warnings[0], cols - 6)) +
        (this.warnings.length > 1 ? a.gray(` (+${this.warnings.length - 1} more)`) : ''));
    }

    // Footer: status + key hints
    lines.push(a.gray(' ' + '─'.repeat(Math.max(0, cols - 2))));
    lines.push(' ' + (this.status ? a.green(a.truncate(this.status, cols - 2)) : a.dim('Ready')));
    lines.push(' ' + this.footerHints());

    // Compose: clear + write, padding to clear stale rows
    let frame = a.home + a.clearScreen;
    frame += lines.slice(0, rows).join('\n');
    this.out.write(frame);

    // Overlays draw on top of the frame
    if (this.mode === 'addFile') this.renderAddFile(cols, rows);
    if (this.mode === 'prompt') this.renderPrompt(cols, rows);
    if (this.mode === 'sessions') this.renderSessions(cols, rows);
    if (this.mode === 'help') this.renderHelp(cols, rows);
    if (this.mode === 'confirmQuit') this.renderConfirmQuit(cols, rows);
  }

  private renderList(lines: string[], cols: number, height: number): void {
    if (this.items.length === 0) {
      lines.push('');
      lines.push(a.dim('   No items yet. Press ') + a.bold('a') + a.dim(' to add a file, ') +
        a.bold('s') + a.dim(' for a separator.'));
      while (lines.length < height) lines.push('');
      return;
    }

    // Window the list around the cursor so it scrolls for long assemblies.
    const visible = Math.max(1, height - 1);
    let start = 0;
    if (this.items.length > visible) {
      start = Math.min(Math.max(0, this.cursor - Math.floor(visible / 2)), this.items.length - visible);
    }
    const end = Math.min(this.items.length, start + visible);

    for (let i = start; i < end; i++) {
      lines.push(this.renderItemRow(this.items[i], i, cols));
    }
    // pad to keep footer pinned
    const used = end - start;
    for (let i = used; i < visible; i++) lines.push('');
  }

  private renderItemRow(item: AssemblyItem, index: number, cols: number): string {
    const selected = index === this.cursor && this.mode === 'list';
    const disabled = item.enabled === false;

    const pointer = selected ? a.cyan('▸') : ' ';
    const check = disabled ? a.gray('[ ]') : a.green('[x]');
    const icon =
      item.kind === 'separator' ? '─' :
      item.kind === 'image' ? '🖼' : '📄';

    const tags: string[] = [];
    if (item.includeInToc) tags.push('toc');
    if (item.kind === 'image') tags.push(`${Math.round((item.scale ?? 1) * 100)}%`);
    if (item.missing) tags.push('MISSING');
    const tagStr = tags.length ? a.gray(' [' + tags.join(' ') + ']') : '';

    const numW = String(this.items.length).length;
    const num = a.dim(String(index + 1).padStart(numW));

    const prefixVisible = 1 + 1 + numW + 1 + 3 + 1 + 2 + 1; // pointer+space+num+space+check+space+icon+space
    const labelRoom = Math.max(8, cols - prefixVisible - a.visibleLength(tagStr) - 2);
    let label = a.truncate(item.label, labelRoom);
    if (disabled) label = a.gray(label);
    else if (item.missing) label = a.red(label);
    else if (item.kind === 'separator') label = a.italic(a.magenta(label));

    const row = ` ${pointer} ${num} ${check} ${icon} ${label}${tagStr}`;
    return selected ? a.bgGray(a.pad(stripToWidth(row, cols), cols)) : row;
  }

  private footerHints(): string {
    const h = (k: string, d: string) => a.bold(k) + a.gray(':' + d);
    switch (this.mode) {
      case 'addFile':
        return a.gray('Filter, then ') + h('↵', 'add') + '  ' + h('esc', 'done');
      case 'prompt':
        return h('↵', 'ok') + '  ' + h('esc', 'cancel');
      case 'sessions':
        return h('↑↓', 'pick') + '  ' + h('↵', 'load') + '  ' + h('esc', 'cancel');
      case 'help':
      case 'confirmQuit':
        return a.gray('press a key…');
      default:
        return [
          h('↑↓', 'move'), h('a', 'add'), h('s', 'sep'), h('e', 'edit'),
          h('␣', 'on/off'), h('J/K', 'reorder'), h('t', 'toc'), h('b', 'build'),
          h('?', 'help'), h('q', 'quit'),
        ].join('  ');
    }
  }

  // ── Overlays ──────────────────────────────────────────────────────────────
  private renderAddFile(cols: number, rows: number): void {
    const w = Math.min(cols - 4, 76);
    const h = Math.min(rows - 4, 20);
    const top = Math.max(1, Math.floor((rows - h) / 2));
    const left = Math.max(1, Math.floor((cols - w) / 2));
    const list = this.filteredFiles();

    const box: string[] = [];
    box.push(a.bold(' Add file ') + a.gray('— type to filter'));
    box.push(a.gray('─'.repeat(w)));
    box.push(' ' + a.cyan('search: ') + a.white(this.fileFilter) + a.inverse(' '));
    box.push('');

    const visible = h - 5;
    let start = 0;
    if (list.length > visible) {
      start = Math.min(Math.max(0, this.fileCursor - Math.floor(visible / 2)), list.length - visible);
    }
    if (list.length === 0) box.push(a.dim('   no matches'));
    for (let i = start; i < Math.min(list.length, start + visible); i++) {
      const f = list[i];
      const sel = i === this.fileCursor;
      const dirPart = f.directory ? a.gray(f.directory + '/') : '';
      const base = path.basename(f.relativePath);
      const typeTag = a.gray(` ·${f.type}`);
      const text = ' ' + dirPart + base + typeTag;
      box.push(sel ? a.bgBlue(a.pad(stripToWidth(text, w - 1), w - 1)) : a.truncate(text, w - 1));
    }
    this.drawBox(box, top, left, w);
  }

  private renderSessions(cols: number, rows: number): void {
    const w = Math.min(cols - 4, 64);
    const h = Math.min(rows - 4, this.sessions.length + 4);
    const top = Math.max(1, Math.floor((rows - h) / 2));
    const left = Math.max(1, Math.floor((cols - w) / 2));
    const box: string[] = [];
    box.push(a.bold(' Load session '));
    box.push(a.gray('─'.repeat(w)));
    this.sessions.forEach((s, i) => {
      const sel = i === this.sessionCursor;
      const text = ' ' + s.filename + a.gray('   ' + relAge(s.savedAt));
      box.push(sel ? a.bgBlue(a.pad(stripToWidth(text, w - 1), w - 1)) : a.truncate(text, w - 1));
    });
    this.drawBox(box, top, left, w);
  }

  private renderPrompt(cols: number, rows: number): void {
    if (!this.prompt) return;
    const w = Math.min(cols - 4, 70);
    const top = Math.max(1, Math.floor(rows / 2) - 2);
    const left = Math.max(1, Math.floor((cols - w) / 2));
    const box: string[] = [];
    box.push(a.bold(' ' + a.truncate(this.prompt.title, w - 2)));
    box.push(a.gray('─'.repeat(w)));
    box.push(' ' + a.white(a.truncate(this.prompt.value, w - 3)) + a.inverse(' '));
    this.drawBox(box, top, left, w);
  }

  private renderHelp(cols: number, rows: number): void {
    const help: Array<[string, string]> = [
      ['↑ ↓ / j k', 'move the cursor'],
      ['J / K', 'reorder item down / up'],
      ['space', 'enable / disable item (kept in the file, skipped on build)'],
      ['a', 'add a file from this folder'],
      ['s', 'insert a section separator page'],
      ['e / ↵', 'edit label (also the table-of-contents text)'],
      ['t', 'toggle this item in the table of contents'],
      ['T', 'turn the table of contents on / off'],
      ['+ / -', 'scale an image up / down (0.5–1.0)'],
      ['x / del', 'remove the item'],
      ['o', 'set the output filename'],
      ['b', 'build the PDF (and open it)'],
      ['w', 'save a .pdfasm session'],
      ['l', 'load a .pdfasm session'],
      ['r', 'rescan the folder'],
      ['q', 'quit'],
    ];
    const w = Math.min(cols - 4, 72);
    const h = Math.min(rows - 2, help.length + 4);
    const top = Math.max(1, Math.floor((rows - h) / 2));
    const left = Math.max(1, Math.floor((cols - w) / 2));
    const box: string[] = [];
    box.push(a.bold(' Keys ') + a.gray('— press any key to close'));
    box.push(a.gray('─'.repeat(w)));
    for (const [k, d] of help) box.push(' ' + a.cyan(a.pad(k, 12)) + a.gray(d));
    this.drawBox(box, top, left, w);
  }

  private renderConfirmQuit(cols: number, rows: number): void {
    const w = Math.min(cols - 4, 50);
    const top = Math.max(1, Math.floor(rows / 2) - 1);
    const left = Math.max(1, Math.floor((cols - w) / 2));
    const box = [
      a.bold(a.yellow(' Unsaved changes')),
      a.gray('─'.repeat(w)),
      ' Quit without saving? ' + a.bold('y') + a.gray(' / ') + a.bold('n'),
    ];
    this.drawBox(box, top, left, w);
  }

  // Draw a bordered box of pre-styled lines at (top,left) with inner width w.
  private drawBox(content: string[], top: number, left: number, w: number): void {
    const horiz = '─'.repeat(w + 2);
    let frame = a.moveTo(top, left) + a.gray('┌' + horiz + '┐');
    content.forEach((line, i) => {
      const padded = a.pad(stripToWidth(line, w), w);
      frame += a.moveTo(top + 1 + i, left) + a.gray('│ ') + padded + a.gray(' │');
    });
    frame += a.moveTo(top + 1 + content.length, left) + a.gray('└' + horiz + '┘');
    this.out.write(frame);
  }
}

// ── Small helpers ───────────────────────────────────────────────────────────

// Truncate a styled string so its *visible* width fits, preserving ANSI codes
// already embedded. We only ever over-shrink, never overflow.
function stripToWidth(s: string, width: number): string {
  if (a.visibleLength(s) <= width) return s;
  // Walk char by char, copying escape sequences verbatim and counting visibles.
  let out = '';
  let visible = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\x1b') {
      const m = /^\x1b\[[0-9;?]*[A-Za-z]/.exec(s.slice(i));
      if (m) { out += m[0]; i += m[0].length - 1; continue; }
    }
    if (visible >= width - 1) { out += '…\x1b[0m'; break; }
    out += s[i];
    visible++;
  }
  return out;
}

function relAge(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
