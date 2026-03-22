import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { AssemblyItem } from '../types.js';
import SortableItem from './SortableItem.js';

interface Props {
  items: AssemblyItem[];
  onChange: (items: AssemblyItem[]) => void;
  onUpdate: (id: string, changes: Partial<AssemblyItem>) => void;
  onRemove: (id: string) => void;
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

export default function AssemblyList({ items, onChange, onUpdate, onRemove }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex(i => i.id === active.id);
      const newIndex = items.findIndex(i => i.id === over.id);
      onChange(arrayMove(items, oldIndex, newIndex));
    }
  };

  return (
    <div>
      <div style={s.header}>
        <div style={s.sectionTitle}>ASSEMBLY ORDER</div>
        <div style={s.hint}>{items.length} item{items.length !== 1 ? 's' : ''}</div>
      </div>

      {items.length === 0 ? (
        <div style={s.empty}>
          Add files from the left panel, or insert a separator page.
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={items.map(i => i.id)}
            strategy={verticalListSortingStrategy}
          >
            <div style={s.root}>
              {items.map(item => (
                <SortableItem
                  key={item.id}
                  item={item}
                  onUpdate={onUpdate}
                  onRemove={onRemove}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {items.length > 0 && (
        <div style={s.legend}>
          <span>⠿ drag handle</span>
          <span>☑ = in TOC</span>
          <span>slider = image scale</span>
          <span>× = remove</span>
        </div>
      )}
    </div>
  );
}
