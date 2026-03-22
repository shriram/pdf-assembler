import type { ScannedFile } from '../types.js';

interface Props {
  files: ScannedFile[];
  onAdd: (file: ScannedFile) => void;
  onAddSeparator: () => void;
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
  },
  cardRoot: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: '#fff',
    border: '1px solid #e0e0e0',
    borderRadius: 8,
    padding: '7px 10px',
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
};

function FileCard({ file, onAdd, indent }: { file: ScannedFile; onAdd: (f: ScannedFile) => void; indent: boolean }) {
  const extRaw = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
  // Use actual extension as badge for non-standard types; fall back to type label for pdf/image
  const knownBadge = TYPE_LABEL[file.type];
  const badge = (extRaw === 'pdf' || ['png','jpg','jpeg','gif','webp'].includes(extRaw))
    ? knownBadge
    : extRaw.toUpperCase() || knownBadge;
  const bgColor = file.embeddable ? (TYPE_COLOR[file.type] ?? '#555') : '#bbb';
  return (
    <div style={{ ...(indent ? s.card : s.cardRoot), opacity: file.embeddable ? 1 : 0.5 }}>
      <span style={{ ...s.badge, background: bgColor }}>{badge}</span>
      <span style={s.name} title={file.relativePath}>{file.name}</span>
      {file.embeddable
        ? <button style={s.addBtn} onClick={() => onAdd(file)}>+ Add</button>
        : <span style={{ fontSize: 11, color: '#bbb', flexShrink: 0 }}>not supported</span>
      }
    </div>
  );
}

export default function FilePicker({ files, onAdd, onAddSeparator }: Props) {
  // Group files by directory
  const groups = new Map<string, ScannedFile[]>();
  for (const file of files) {
    const dir = file.directory;
    if (!groups.has(dir)) groups.set(dir, []);
    groups.get(dir)!.push(file);
  }

  // Root files first, then subdirectories sorted alphabetically
  const rootFiles = groups.get('') ?? [];
  const subdirs = [...groups.keys()]
    .filter(d => d !== '')
    .sort((a, b) => a.localeCompare(b));

  return (
    <div style={s.root}>
      <div style={s.sectionTitle}>FILES IN DIRECTORY</div>
      <button style={s.sepBtn} onClick={onAddSeparator}>
        ＋ Add separator page
      </button>

      {files.length === 0 ? (
        <div style={s.empty}>No PDFs or images found.</div>
      ) : (
        <>
          {rootFiles.map(file => (
            <FileCard key={file.path} file={file} onAdd={onAdd} indent={false} />
          ))}

          {subdirs.map(dir => (
            <div key={dir}>
              <div style={s.dirHeader}>
                <span>📁</span>
                <span>{dir}</span>
              </div>
              {groups.get(dir)!.map(file => (
                <div key={file.path} style={{ marginBottom: 5 }}>
                  <FileCard file={file} onAdd={onAdd} indent={true} />
                </div>
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
