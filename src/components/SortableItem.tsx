import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { AssemblyItem } from '../types.js';
import SeparatorEditor from './SeparatorEditor.js';

interface Props {
  item: AssemblyItem;
  onUpdate: (id: string, changes: Partial<AssemblyItem>) => void;
  onRemove: (id: string) => void;
}

const KIND_COLOR: Record<string, string> = {
  pdf: '#c0392b',
  image: '#27ae60',
  separator: '#7f5af0',
};

const KIND_LABEL: Record<string, string> = {
  pdf: 'PDF',
  image: 'IMG',
  separator: 'SEP',
};

const s: Record<string, React.CSSProperties> = {
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: '#fff',
    border: '1px solid #e0e0e0',
    borderRadius: 8,
    padding: '8px 10px',
    userSelect: 'none',
  },
  handle: {
    cursor: 'grab',
    color: '#bbb',
    fontSize: 18,
    flexShrink: 0,
    lineHeight: 1,
    padding: '0 2px',
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
  labelText: {
    flex: 1,
    fontSize: 13,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: '#1a1a2e',
    minWidth: 0,
  },
  sepPreview: {
    flex: 1,
    fontSize: 12,
    color: '#555',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    fontStyle: 'italic',
  },
  editBtn: {
    background: 'none',
    border: '1px solid #ccc',
    borderRadius: 4,
    padding: '2px 8px',
    fontSize: 11,
    cursor: 'pointer',
    flexShrink: 0,
    color: '#555',
  },
  tocCheck: { flexShrink: 0, cursor: 'pointer' },
  slider: { width: 70, flexShrink: 0 },
  removeBtn: {
    background: 'none',
    border: 'none',
    color: '#bbb',
    cursor: 'pointer',
    fontSize: 16,
    flexShrink: 0,
    lineHeight: 1,
    padding: '0 2px',
  },
};

export default function SortableItem({ item, onUpdate, onRemove }: Props) {
  const [editingSep, setEditingSep] = useState(
    item.kind === 'separator' && (item.separatorText ?? '') === '',
  );

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const enabled = item.enabled !== false;
  const style: React.CSSProperties = {
    ...s.row,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : enabled ? 1 : 0.4,
    boxShadow: isDragging ? '0 4px 16px rgba(0,0,0,0.15)' : undefined,
  };

  const ext = item.path ? item.path.split('.').pop()?.toLowerCase() : '';
  const notActualPdf = item.kind === 'pdf' && ext && ext !== 'pdf';
  const badgeLabel = notActualPdf ? ext!.toUpperCase() : KIND_LABEL[item.kind];
  const badgeColor = notActualPdf ? '#0891b2' : (KIND_COLOR[item.kind] ?? '#888');

  return (
    <>
      <div ref={setNodeRef} style={style}>
        <span style={s.handle} {...attributes} {...listeners} title="Drag to reorder">⠿</span>

        <span style={{ ...s.badge, background: badgeColor }}>{badgeLabel}</span>

        {item.kind === 'separator' ? (
          <>
            <span
              style={s.sepPreview}
              title="Click to edit separator text"
              onClick={() => setEditingSep(true)}
            >
              {item.separatorText || <span style={{ color: '#bbb', fontStyle: 'italic' }}>click Edit to set text</span>}
            </span>
            <button style={s.editBtn} onClick={() => setEditingSep(true)}>Edit</button>
          </>
        ) : (
          <span style={s.labelText} title={item.label}>{item.label}</span>
        )}

        {item.kind === 'image' && (
          <input
            type="range"
            min={50}
            max={100}
            value={Math.round((item.scale ?? 1.0) * 100)}
            onChange={e => onUpdate(item.id, { scale: parseInt(e.target.value) / 100 })}
            style={s.slider}
            title={`Scale: ${Math.round((item.scale ?? 1.0) * 100)}%`}
          />
        )}

        <input
          type="checkbox"
          style={s.tocCheck}
          checked={item.enabled !== false}
          onChange={e => onUpdate(item.id, { enabled: e.target.checked })}
          title="Include in output"
        />

        <button style={s.removeBtn} onClick={() => onRemove(item.id)} title="Remove">×</button>
      </div>

      {editingSep && (
        <SeparatorEditor
          initialText={item.separatorText ?? item.label}
          onSave={text => {
            onUpdate(item.id, { separatorText: text, label: text.split('\n')[0] || text });
            setEditingSep(false);
          }}
          onCancel={() => setEditingSep(false)}
        />
      )}
    </>
  );
}
