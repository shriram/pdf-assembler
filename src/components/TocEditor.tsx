import type { TocItem, AssemblyItem } from '../types.js';

interface Props {
  tocItems: TocItem[];
  assemblyItems: AssemblyItem[];
  onChange: (items: TocItem[]) => void;
}

const s: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', gap: 8 },
  sectionTitle: { fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: 1, marginBottom: 4 },
  empty: { fontSize: 13, color: '#aaa', padding: '12px 0' },
  entry: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 0',
    borderBottom: '1px solid #f0f0f0',
  },
  labelInput: {
    flex: 1,
    border: 'none',
    borderBottom: '1px solid #ddd',
    outline: 'none',
    fontSize: 12,
    background: 'transparent',
    padding: '2px 0',
    color: '#1a1a2e',
    minWidth: 0,
  },
  pageNum: {
    fontSize: 11,
    color: '#aaa',
    flexShrink: 0,
    width: 32,
    textAlign: 'right',
  },
  removeBtn: {
    background: 'none',
    border: 'none',
    color: '#ccc',
    cursor: 'pointer',
    fontSize: 14,
    padding: '0 2px',
    flexShrink: 0,
    lineHeight: 1,
  },
  hint: { fontSize: 11, color: '#bbb', marginTop: 8, fontStyle: 'italic' },
  previewBox: {
    background: '#f9f9f9',
    border: '1px solid #e0e0e0',
    borderRadius: 6,
    padding: 12,
    marginTop: 8,
  },
  previewTitle: { fontSize: 13, fontWeight: 700, color: '#1a1a2e', marginBottom: 8 },
  previewEntry: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 4,
    fontSize: 11,
    color: '#333',
    marginBottom: 4,
  },
  previewLabel: { flexShrink: 0, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  previewDots: { flex: 1, color: '#bbb', overflow: 'hidden', whiteSpace: 'nowrap' },
  previewPage: { flexShrink: 0, color: '#888' },
};

export default function TocEditor({ tocItems, assemblyItems, onChange }: Props) {
  const updateLabel = (id: string, label: string) => {
    onChange(tocItems.map(t => (t.id === id ? { ...t, label } : t)));
  };

  const removeEntry = (id: string) => {
    onChange(tocItems.filter(t => t.id !== id));
    // Also uncheck includeInToc on the assembly item — done via parent's onChange flow
    // (The parent will reconcile this naturally since TocEditor doesn't own assemblyItems)
  };

  // Order TOC entries in assembly order
  const assemblyOrder = new Map(assemblyItems.map((item, i) => [item.id, i]));
  const ordered = [...tocItems].sort(
    (a, b) => (assemblyOrder.get(a.id) ?? 999) - (assemblyOrder.get(b.id) ?? 999),
  );

  return (
    <div style={s.root}>
      <div style={s.sectionTitle}>TABLE OF CONTENTS</div>

      {ordered.length === 0 ? (
        <div style={s.empty}>
          Check ☑ on items to include them in the TOC.
        </div>
      ) : (
        <>
          {ordered.map(entry => (
            <div key={entry.id} style={s.entry}>
              <input
                style={s.labelInput}
                value={entry.label}
                onChange={e => updateLabel(entry.id, e.target.value)}
                title="Edit TOC label"
              />
              <span style={s.pageNum}>p.?</span>
              <button
                style={s.removeBtn}
                onClick={() => removeEntry(entry.id)}
                title="Remove from TOC"
              >
                ×
              </button>
            </div>
          ))}

          <div style={s.hint}>
            Page numbers are calculated at build time.
            Emoji in labels will be omitted from the PDF font.
          </div>

          {/* Visual preview */}
          <div style={s.previewBox}>
            <div style={s.previewTitle}>Table of Contents</div>
            {ordered.map(entry => (
              <div key={entry.id} style={s.previewEntry}>
                <span style={s.previewLabel}>{entry.label}</span>
                <span style={s.previewDots}>{'·'.repeat(30)}</span>
                <span style={s.previewPage}>p.?</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
