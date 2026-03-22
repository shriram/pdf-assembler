import { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { ScannedFile } from '../types.js';

interface Props {
  files: ScannedFile[];
  onAdd: (file: ScannedFile) => void;
  onAddSeparator: () => void;
  onPreview: (file: ScannedFile) => void;
}

const TYPE_LABEL: Record<string, string> = {
  readme: 'COVER',
  pdf: 'PDF',
  image: 'IMG',
};

const TYPE_COLOR: Record<string, string> = {
  readme: '#0891b2',
  pdf: '#c0392b',
  image: '#27ae60',
};

const s: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', gap: 6 },
  sectionTitle: { fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: 1, marginBottom: 4 },
  filterInput: {
    width: '100%',
    boxSizing: 'border-box',
    border: '1px solid #ddd',
    borderRadius: 6,
    padding: '6px 8px',
    fontSize: 12,
    outline: 'none',
    marginBottom: 8,
    background: '#fff',
    color: '#333',
  },
  sepBtn: {
    width: '100%',
    background: '#fff',
    border: '2px dashed #aaa',
    borderRadius: 8,
    padding: '10px 12px',
    cursor: 'pointer',
    fontSize: 13,
    color: '#555',
    textAlign: 'left',
    marginBottom: 12,
  },
  dirHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    fontWeight: 700,
    color: '#555',
    marginTop: 10,
    marginBottom: 4,
    paddingBottom: 3,
    borderBottom: '1px solid #ddd',
  },
  card: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: '#fff',
    border: '1px solid #e0e0e0',
    borderRadius: 8,
    padding: '7px 10px',
    marginLeft: 8,
    cursor: 'pointer',
  },
  cardRoot: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: '#fff',
    border: '1px solid #e0e0e0',
    borderRadius: 8,
    padding: '7px 10px',
    cursor: 'pointer',
  },
  badge: {
    fontSize: 10,
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: 4,
    color: '#fff',
    flexShrink: 0,
    letterSpacing: 0.5,
  },
  name: { flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  addBtn: {
    background: 'none',
    border: '1px solid #aaa',
    borderRadius: 4,
    padding: '3px 8px',
    fontSize: 12,
    cursor: 'pointer',
    flexShrink: 0,
    color: '#444',
  },
  empty: { fontSize: 13, color: '#999', padding: '16px 0', textAlign: 'center' },
  filterHint: { fontSize: 10, color: '#bbb', marginTop: -6, marginBottom: 4 },
};

function parseFilter(text: string) {
  const terms = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const positive = terms.filter(t => !t.startsWith('-'));
  const negative = terms.filter(t => t.startsWith('-')).map(t => t.slice(1)).filter(Boolean);
  return { positive, negative };
}

function isFileVisible(file: ScannedFile, positive: string[], negative: string[]): boolean {
  const path = file.relativePath.toLowerCase();
  if (negative.some(t => path.includes(t))) return false;
  if (positive.length > 0 && !positive.some(t => path.includes(t))) return false;
  return true;
}

function DraggableFileCard({
  file,
  onAdd,
  onPreview,
  indent,
}: {
  file: ScannedFile;
  onAdd: (f: ScannedFile) => void;
  onPreview: (f: ScannedFile) => void;
  indent: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `file:${file.path}`,
    data: { type: 'file', file },
    disabled: !file.embeddable,
  });

  const extRaw = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
  const knownBadge = TYPE_LABEL[file.type];
  const badge = (extRaw === 'pdf' || ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(extRaw))
    ? knownBadge
    : extRaw.toUpperCase() || knownBadge;
  const bgColor = file.embeddable ? (TYPE_COLOR[file.type] ?? '#555') : '#bbb';
  const base = indent ? s.card : s.cardRoot;

  return (
    <div
      ref={setNodeRef}
      style={{ ...base, opacity: isDragging ? 0.4 : file.embeddable ? 1 : 0.5 }}
      onClick={() => onPreview(file)}
      title="Click to preview"
      {...attributes}
      {...listeners}
    >
      <span style={{ ...s.badge, background: bgColor }}>{badge}</span>
      <span style={s.name} title={file.relativePath}>{file.name}</span>
      {file.embeddable ? (
        <button
          style={s.addBtn}
          onClick={e => { e.stopPropagation(); onAdd(file); }}
          title="Add to assembly"
        >
          + Add
        </button>
      ) : (
        <span style={{ fontSize: 11, color: '#bbb', flexShrink: 0 }}>unsupported</span>
      )}
    </div>
  );
}

export default function FilePicker({ files, onAdd, onAddSeparator, onPreview }: Props) {
  const [filterText, setFilterText] = useState('');
  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(new Set());
  const { positive, negative } = parseFilter(filterText);
  const hasFilter = positive.length > 0 || negative.length > 0;

  const visibleFiles = hasFilter ? files.filter(f => isFileVisible(f, positive, negative)) : files;

  const groups = new Map<string, ScannedFile[]>();
  for (const file of visibleFiles) {
    const dir = file.directory;
    if (!groups.has(dir)) groups.set(dir, []);
    groups.get(dir)!.push(file);
  }

  const rootFiles = groups.get('') ?? [];
  const subdirs = [...groups.keys()].filter(d => d !== '').sort((a, b) => a.localeCompare(b));

  const toggleDir = (dir: string) => {
    setCollapsedDirs(prev => {
      const next = new Set(prev);
      if (next.has(dir)) next.delete(dir); else next.add(dir);
      return next;
    });
  };

  return (
    <div style={s.root}>
      <div style={s.sectionTitle}>FILES IN DIRECTORY</div>
      <input
        style={s.filterInput}
        placeholder="filter… (-term to exclude)"
        value={filterText}
        onChange={e => setFilterText(e.target.value)}
        spellCheck={false}
      />
      <button style={s.sepBtn} onClick={onAddSeparator}>＋ Add separator page</button>

      {visibleFiles.length === 0 ? (
        <div style={s.empty}>{files.length === 0 ? 'No PDFs or images found.' : 'No files match the filter.'}</div>
      ) : (
        <>
          {rootFiles.map(file => (
            <DraggableFileCard key={file.path} file={file} onAdd={onAdd} onPreview={onPreview} indent={false} />
          ))}

          {subdirs.map(dir => {
            const collapsed = collapsedDirs.has(dir);
            const dirFiles = groups.get(dir)!;
            return (
              <div key={dir}>
                <div
                  style={{ ...s.dirHeader, cursor: 'pointer', userSelect: 'none' } as React.CSSProperties}
                  onClick={() => toggleDir(dir)}
                  title={collapsed ? 'Click to expand' : 'Click to collapse'}
                >
                  <span style={{ fontSize: 9, color: '#999', width: 10, flexShrink: 0 }}>
                    {collapsed ? '▶' : '▼'}
                  </span>
                  <span>📁</span>
                  <span>{dir}</span>
                  {collapsed && (
                    <span style={{ fontSize: 10, color: '#aaa', marginLeft: 'auto' }}>
                      {dirFiles.length} file{dirFiles.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                {!collapsed && dirFiles.map(file => (
                  <div key={file.path} style={{ marginBottom: 5 }}>
                    <DraggableFileCard file={file} onAdd={onAdd} onPreview={onPreview} indent={true} />
                  </div>
                ))}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
