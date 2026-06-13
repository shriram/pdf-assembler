#!/usr/bin/env node
// Terminal UI for the PDF Assembler.
//
//   npm run tui                 # assemble files in the current directory
//   npm run tui -- --cwd DIR    # assemble files in DIR
//
// Reuses the same scanner / pdf-builder core as the web app, so a TUI build
// and a browser build produce identical PDFs.

import { TuiApp } from './app.js';

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

const scanDir = getArg('--cwd') ?? process.cwd();

if (!process.stdin.isTTY) {
  console.error('The PDF Assembler TUI needs an interactive terminal (TTY).');
  process.exit(1);
}

const app = new TuiApp(scanDir);
app.run()
  .then(() => process.exit(0))
  .catch(err => {
    // Restore the terminal before printing — render() may have left it dirty.
    process.stdout.write('\x1b[?25h\x1b[?1049l');
    console.error(err);
    process.exit(1);
  });
