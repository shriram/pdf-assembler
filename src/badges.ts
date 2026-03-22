// Single source of truth for file-type badge labels and colours.
// Both FilePicker and SortableItem import from here.

export interface BadgeInfo {
  label: string;
  color: string;
}

const EXT_BADGES: Record<string, BadgeInfo> = {
  pdf:      { label: 'PDF',  color: '#c0392b' }, // red
  png:      { label: 'IMG',  color: '#27ae60' }, // green
  jpg:      { label: 'IMG',  color: '#27ae60' },
  jpeg:     { label: 'IMG',  color: '#27ae60' },
  gif:      { label: 'GIF',  color: '#999999' }, // grey — unsupported
  webp:     { label: 'WEBP', color: '#999999' }, // grey — unsupported
  md:       { label: 'MD',   color: '#2563eb' }, // blue
  markdown: { label: 'MD',   color: '#2563eb' },
  txt:      { label: 'TXT',  color: '#7c3aed' }, // violet
};

export const SEPARATOR_BADGE: BadgeInfo = { label: 'SEP', color: '#7f5af0' };

/**
 * Returns the badge label and colour for a file given its path.
 * Pass isCover=true to show "COVER" as the label (colour still follows extension).
 * Falls back to the uppercased extension for unknown types.
 */
export function badgeForPath(filePath: string, isCover = false): BadgeInfo {
  const ext = (filePath.split('.').pop() ?? '').toLowerCase();
  const info: BadgeInfo = EXT_BADGES[ext] ?? { label: ext.toUpperCase() || '?', color: '#888' };
  return isCover ? { ...info, label: 'COVER' } : info;
}
