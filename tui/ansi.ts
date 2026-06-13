// Minimal ANSI / terminal helpers — zero dependencies.
// Everything the TUI needs to draw, colour, and drive the alternate screen.

export const ESC = '\x1b[';

// ── Screen / cursor control ────────────────────────────────────────────────
export const enterAltScreen = `${ESC}?1049h`;
export const leaveAltScreen = `${ESC}?1049l`;
export const hideCursor = `${ESC}?25l`;
export const showCursor = `${ESC}?25h`;
export const clearScreen = `${ESC}2J${ESC}H`;
export const home = `${ESC}H`;
export const clearLine = `${ESC}2K`;

export function moveTo(row: number, col: number): string {
  return `${ESC}${row};${col}H`;
}

// ── Styling ────────────────────────────────────────────────────────────────
const wrap = (code: number) => (s: string) => `${ESC}${code}m${s}${ESC}0m`;

export const bold = wrap(1);
export const dim = wrap(2);
export const italic = wrap(3);
export const underline = wrap(4);
export const inverse = wrap(7);

export const red = wrap(31);
export const green = wrap(32);
export const yellow = wrap(33);
export const blue = wrap(34);
export const magenta = wrap(35);
export const cyan = wrap(36);
export const white = wrap(37);
export const gray = wrap(90);

export const bgBlue = (s: string) => `${ESC}44m${ESC}97m${s}${ESC}0m`;
export const bgGray = (s: string) => `${ESC}100m${s}${ESC}0m`;

// Length of a string ignoring ANSI escape sequences (for layout math).
export function visibleLength(s: string): number {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').length;
}

// Truncate a plain (un-styled) string to a visible width, adding an ellipsis.
export function truncate(s: string, width: number): string {
  if (s.length <= width) return s;
  if (width <= 1) return s.slice(0, Math.max(0, width));
  return s.slice(0, width - 1) + '…';
}

// Pad a plain string to a fixed visible width (right padding with spaces).
export function pad(s: string, width: number): string {
  return s.length >= width ? s : s + ' '.repeat(width - s.length);
}
