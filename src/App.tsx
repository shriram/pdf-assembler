import { useEffect, useState, useCallback, useRef } from 'react';
import { nanoid } from 'nanoid';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragStartEvent, DragEndEvent, DragOverEvent } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import type { ScannedFile, AssemblyItem, TocItem, BuildResponse } from './types.js';
import FilePicker from './components/FilePicker.js';
import AssemblyList from './components/AssemblyList.js';
import TocEditor from './components/TocEditor.js';
import PreviewPanel from './components/PreviewPanel.js';
import type { PreviewSource } from './components/PreviewPanel.js';

const st: Record<string, React.CSSProperties> = {
  app: {
    display: 'grid',
    gridTemplateColumns: '240px 280px 1fr',
    gridTemplateRows: 'auto 1fr',
    height: '100vh',
    gap: 0,
  },
  tocToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    cursor: 'pointer',
    userSelect: 'none',
  } as React.CSSProperties,
  header: {
    gridColumn: '1 / -1',
    background: '#1a1a2e',
    color: '#fff',
    padding: '12px 24px',
    display: 'flex',
    alignItems: 'center',
    gap: 16,
  },
  title: { fontSize: 18, fontWeight: 700, letterSpacing: 0.5 },
  headerRight: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 },
  outputInput: {
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 6,
    color: '#fff',
    padding: '6px 10px',
    fontSize: 13,
    width: 180,
  },
  buildBtn: {
    background: '#4a9eff',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '8px 18px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  buildBtnDisabled: { background: '#666', cursor: 'not-allowed' },
  panel: {
    overflowY: 'auto',
    padding: 16,
    borderRight: '1px solid #ddd',
    background: '#fafafa',
  },
  assembly: {
    overflowY: 'auto',
    padding: 16,
    background: '#f0f0f0',
    borderRight: '1px solid #ddd',
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
  },
  previewBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  previewBtn: {
    background: '#4a9eff',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '6px 14px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    flexShrink: 0,
  },
  previewBtnDisabled: { background: '#bbb', cursor: 'not-allowed' },
  previewBtnFresh: { background: '#888' },
  previewStatus: { fontSize: 11, color: '#888' },
  warnings: {
    background: '#fff3cd',
    border: '1px solid #ffc107',
    borderRadius: 6,
    padding: 12,
    margin: '0 0 12px',
    fontSize: 13,
  },
  tocDivider: { margin: '16px 0 12px', border: 'none', borderTop: '1px solid #ccc' },
  dragGhost: {
    background: '#fff',
    border: '2px solid #4a9eff',
    borderRadius: 8,
    padding: '8px 12px',
    fontSize: 13,
    boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
  },
};

type ActiveDrag =
  | { type: 'file'; file: ScannedFile }
  | { type: 'assembly'; label: string }
  | null;

function makeAssemblyItem(file: ScannedFile): AssemblyItem {
  return {
    id: nanoid(),
    kind: file.type === 'image' ? 'image' : 'pdf',
    label: file.directory ? file.relativePath : file.name,
    path: file.path,
    includeInToc: true,
    scale: 1.0,
  };
}

export default function App() {
  const [scannedFiles, setScannedFiles] = useState<ScannedFile[]>([]);
  const [assemblyItems, setAssemblyItems] = useState<AssemblyItem[]>([]);
  const [tocItems, setTocItems] = useState<TocItem[]>([]);
  const [outputName, setOutputName] = useState('output.pdf');
  const [tocEnabled, setTocEnabled] = useState(false);
  const [building, setBuilding] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [lastResult, setLastResult] = useState<BuildResponse | null>(null);
  const [previewSource, setPreviewSource] = useState<PreviewSource>(null);
  const [activeDrag, setActiveDrag] = useState<ActiveDrag>(null);
  const [fileDropTarget, setFileDropTarget] = useState<string | null>(null);

  // Track whether the assembly has changed since the last preview was generated
  const currentAssemblyJson = JSON.stringify({
    items: assemblyItems,
    toc: tocEnabled ? tocItems : [],
  });
  const [previewedJson, setPreviewedJson] = useState('');
  const previewBlobRef = useRef<string | null>(null);

  const previewIsCurrentAssembly =
    previewSource?.type === 'assembly' && currentAssemblyJson === previewedJson;
  const previewBtnEnabled = !previewing && assemblyItems.length > 0 && !previewIsCurrentAssembly;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  useEffect(() => {
    fetch('/api/files')
      .then(r => r.json())
      .then((files: ScannedFile[]) => {
        setScannedFiles(files);
        const readmeItems: AssemblyItem[] = files
          .filter(f => f.type === 'readme')
          .map(f => ({
            id: nanoid(),
            kind: 'pdf' as const,
            label: f.directory ? f.relativePath : f.name,
            path: f.path,
            includeInToc: false,
          }));
        setAssemblyItems(readmeItems);
      })
      .catch(console.error);
  }, []);

  const addFile = useCallback((file: ScannedFile) => {
    const item = makeAssemblyItem(file);
    setAssemblyItems(prev => [...prev, item]);
    setTocItems(prev => [...prev, { id: item.id, label: item.label }]);
  }, []);

  const addSeparator = useCallback(() => {
    const item: AssemblyItem = {
      id: nanoid(),
      kind: 'separator',
      label: 'New Section',
      separatorText: '',
      includeInToc: true,
    };
    setAssemblyItems(prev => [...prev, item]);
    setTocItems(prev => [...prev, { id: item.id, label: '' }]);
  }, []);

  const updateItem = useCallback((id: string, changes: Partial<AssemblyItem>) => {
    setAssemblyItems(prev =>
      prev.map(item => (item.id === id ? { ...item, ...changes } : item)),
    );
    if (changes.label !== undefined) {
      setTocItems(prev => prev.map(t => (t.id === id ? { ...t, label: changes.label! } : t)));
    }
    if (changes.includeInToc !== undefined) {
      if (changes.includeInToc) {
        setTocItems(prev => {
          if (prev.some(t => t.id === id)) return prev;
          const item = assemblyItems.find(i => i.id === id);
          return [...prev, { id, label: item?.label ?? '' }];
        });
      } else {
        setTocItems(prev => prev.filter(t => t.id !== id));
      }
    }
  }, [assemblyItems]);

  const removeItem = useCallback((id: string) => {
    setAssemblyItems(prev => prev.filter(i => i.id !== id));
    setTocItems(prev => prev.filter(t => t.id !== id));
  }, []);

  // DnD handlers
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    if (active.data.current?.type === 'file') {
      setActiveDrag({ type: 'file', file: active.data.current.file as ScannedFile });
    } else {
      const item = assemblyItems.find(i => i.id === active.id);
      setActiveDrag(item ? { type: 'assembly', label: item.label } : null);
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    if (event.active.data.current?.type === 'file') {
      setFileDropTarget(typeof event.over?.id === 'string' ? event.over.id : null);
    }
  };

  const handleDragCancel = () => {
    setActiveDrag(null);
    setFileDropTarget(null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDrag(null);
    setFileDropTarget(null);
    const { active, over } = event;

    if (active.data.current?.type === 'file') {
      // Dragging a file card into assembly
      const file = active.data.current.file as ScannedFile;
      const newItem = makeAssemblyItem(file);
      if (over && over.id !== 'assembly-zone') {
        // Insert before the hovered assembly item
        const overIdx = assemblyItems.findIndex(i => i.id === over.id);
        if (overIdx !== -1) {
          setAssemblyItems(prev => [
            ...prev.slice(0, overIdx),
            newItem,
            ...prev.slice(overIdx),
          ]);
          setTocItems(prev => [...prev, { id: newItem.id, label: newItem.label }]);
          return;
        }
      }
      // Append to end
      setAssemblyItems(prev => [...prev, newItem]);
      setTocItems(prev => [...prev, { id: newItem.id, label: newItem.label }]);
      return;
    }

    // Reorder within assembly
    if (over && active.id !== over.id) {
      const oldIdx = assemblyItems.findIndex(i => i.id === active.id);
      const newIdx = assemblyItems.findIndex(i => i.id === over.id);
      if (oldIdx !== -1 && newIdx !== -1) {
        setAssemblyItems(prev => arrayMove(prev, oldIdx, newIdx));
      }
    }
  };

  const handlePreviewFile = useCallback((file: ScannedFile) => {
    const kind = file.type === 'image' ? 'image' : 'pdf';
    setPreviewSource({ type: 'file', path: file.path, kind, label: file.name });
  }, []);

  const handlePreviewAssembly = async () => {
    setPreviewing(true);
    const jsonSnapshot = currentAssemblyJson;
    try {
      const res = await fetch('/api/preview-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: assemblyItems,
          tocItems: tocEnabled ? tocItems : [],
          outputName: 'preview',
        }),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const blob = await res.blob();
      if (previewBlobRef.current) URL.revokeObjectURL(previewBlobRef.current);
      const url = URL.createObjectURL(blob);
      previewBlobRef.current = url;
      setPreviewSource({ type: 'assembly', blobUrl: url });
      setPreviewedJson(jsonSnapshot);
    } catch (err) {
      setWarnings(prev => [`Preview failed: ${String(err)}`, ...prev]);
    } finally {
      setPreviewing(false);
    }
  };

  const handleBuild = async () => {
    setBuilding(true);
    setWarnings([]);
    setLastResult(null);
    try {
      const res = await fetch('/api/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: assemblyItems, tocItems: tocEnabled ? tocItems : [], outputName }),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const warnings = JSON.parse(res.headers.get('X-Pdf-Warnings') ?? '[]') as string[];
      const pageCount = parseInt(res.headers.get('X-Pdf-Pages') ?? '0', 10);
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const fnMatch = disposition.match(/filename="([^"]+)"/);
      const filename = fnMatch?.[1] ?? outputName;
      setLastResult({ filename, pageCount, warnings } as BuildResponse);
      if (warnings.length) setWarnings(warnings);
      // Stream bytes → blob → download link; no file ever written to the scanned directory
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setWarnings([`Build failed: ${String(err)}`]);
    } finally {
      setBuilding(false);
    }
  };

  const canBuild = assemblyItems.length > 0 && !building;

  const previewBtnStyle = {
    ...st.previewBtn,
    ...(!previewBtnEnabled ? st.previewBtnDisabled : {}),
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div style={st.app}>
        {/* Header */}
        <header style={st.header}>
          <span style={st.title}>PDF Assembler</span>
          {lastResult && (
            <span style={{ fontSize: 13, color: '#adf', marginLeft: 8 }}>
              Last build: {lastResult.pageCount} pages → {lastResult.filename}
            </span>
          )}
          <div style={st.headerRight}>
            <label style={st.tocToggle}>
              <input
                type="checkbox"
                checked={tocEnabled}
                onChange={e => setTocEnabled(e.target.checked)}
              />
              Table of Contents
            </label>
            <input
              style={st.outputInput}
              value={outputName}
              onChange={e => setOutputName(e.target.value)}
              placeholder="output.pdf"
              title="Output filename"
            />
            <button
              style={{ ...st.buildBtn, ...(canBuild ? {} : st.buildBtnDisabled) }}
              onClick={handleBuild}
              disabled={!canBuild}
            >
              {building ? 'Building…' : 'Build PDF'}
            </button>
          </div>
        </header>

        {/* Left: file picker */}
        <div style={st.panel}>
          <FilePicker
            files={scannedFiles}
            onAdd={addFile}
            onAddSeparator={addSeparator}
            onPreview={handlePreviewFile}
          />
        </div>

        {/* Center: assembly + optional TOC */}
        <div style={st.assembly}>
          <div style={st.previewBar}>
            <button
              style={previewBtnStyle}
              onClick={handlePreviewAssembly}
              disabled={!previewBtnEnabled}
              title={
                assemblyItems.length === 0 ? 'Add items to assembly first'
                : previewIsCurrentAssembly ? 'Preview is up to date'
                : 'Render a preview of the assembled document'
              }
            >
              {previewing ? 'Previewing…' : 'Preview Assembly'}
            </button>
            {previewIsCurrentAssembly && (
              <span style={st.previewStatus}>up to date</span>
            )}
          </div>

          {warnings.length > 0 && (
            <div style={st.warnings}>
              <strong>Warnings:</strong>
              <ul style={{ marginTop: 4, paddingLeft: 16 }}>
                {warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          <AssemblyList
            items={assemblyItems}
            onUpdate={updateItem}
            onRemove={removeItem}
            fileDropTarget={fileDropTarget}
          />

          {tocEnabled && (
            <>
              <hr style={st.tocDivider} />
              <TocEditor
                tocItems={tocItems}
                assemblyItems={assemblyItems}
                onChange={setTocItems}
              />
            </>
          )}
        </div>

        {/* Right: preview */}
        <PreviewPanel source={previewSource} previewing={previewing} />
      </div>

      {/* Drag overlay — ghost card shown while dragging */}
      <DragOverlay>
        {activeDrag && (
          <div style={st.dragGhost}>
            {activeDrag.type === 'file' ? activeDrag.file.name : activeDrag.label}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
