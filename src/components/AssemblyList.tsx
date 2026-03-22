import { Fragment } from 'react';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import type { AssemblyItem } from '../types.js';
import SortableItem from './SortableItem.js';

interface Props {
  items: AssemblyItem[];
  onUpdate: (id: string, changes: Partial<AssemblyItem>) => void;
  onRemove: (id: string) => void;
  fileDropTarget?: string | null;
}

function InsertionIndicator() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '1px 0', pointerEvents: 'none' }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4a9eff', flexShrink: 0 }} />
      <div style={{ flex: 1, height: 2, background: '#4a9eff', borderRadius: 1 }} />
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', gap: 8, minHeight: 200 },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: 1 },
  hint: { fontSize: 11, color: '#aaa' },
  empty: {
    textAlign: 'center',
    color: '#aaa',
    fontSize: 13,
    padding: 32,
    border: '2px dashed #ddd',
    borderRadius: 8,
    background: '#fafafa',
  },
  legend: {
    display: 'flex',
    gap: 12,
    fontSize: 11,
    color: '#888',
    marginTop: 8,
    flexWrap: 'wrap',
  },
};

export default function AssemblyList({ items, onUpdate, onRemove, fileDropTarget }: Props) {
  const { setNodeRef } = useDroppable({ id: 'assembly-zone' });
  const isDroppingOnZone = fileDropTarget === 'assembly-zone';

  return (
    <div>
      <div style={s.header}>
        <div style={s.sectionTitle}>ASSEMBLY ORDER</div>
        <div style={s.hint}>{items.length} item{items.length !== 1 ? 's' : ''}</div>
      </div>

      <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} style={s.root}>
          {items.length === 0 ? (
            <div style={{
              ...s.empty,
              ...(fileDropTarget ? { borderColor: '#4a9eff', background: '#f0f7ff', color: '#4a9eff' } : {}),
            }}>
              {fileDropTarget ? 'Drop to add' : 'Add files from the left panel, or drag them here.'}
            </div>
          ) : (
            <>
              {items.map(item => (
                <Fragment key={item.id}>
                  {fileDropTarget === item.id && <InsertionIndicator />}
                  <SortableItem item={item} onUpdate={onUpdate} onRemove={onRemove} />
                </Fragment>
              ))}
              {isDroppingOnZone && <InsertionIndicator />}
            </>
          )}
        </div>
      </SortableContext>

      {items.length > 0 && (
        <div style={s.legend}>
          <span>⠿ drag handle</span>
          <span>☑ = include in output</span>
          <span>slider = image scale</span>
          <span>× = remove</span>
        </div>
      )}
    </div>
  );
}
