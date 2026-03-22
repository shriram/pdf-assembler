import { useEffect, useState, useCallback } from 'react';
import { nanoid } from 'nanoid';
import type { ScannedFile, AssemblyItem, TocItem, BuildResponse } from './types.js';
import FilePicker from './components/FilePicker.js';
import AssemblyList from './components/AssemblyList.js';
import TocEditor from './components/TocEditor.js';

const styles: Record<string, React.CSSProperties> = {
  app: (tocEnabled: boolean): React.CSSProperties => ({
    display: 'grid',
    gridTemplateColumns: tocEnabled ? '260px 1fr 280px' : '260px 1fr',
    gridTemplateRows: 'auto 1fr',
    height: '100vh',
    gap: 0,
  }),
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
    width: 200,
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
  buildBtnDisabled: {
    background: '#666',
    cursor: 'not-allowed',
  },
  panel: {
    overflowY: 'auto',
    padding: 16,
    borderRight: '1px solid #ddd',
    background: '#fafafa',
  },
  panelRight: {
    overflowY: 'auto',
    padding: 16,
    borderLeft: '1px solid #ddd',
    background: '#fafafa',
  },
  center: {
    overflowY: 'auto',
    padding: 16,
    background: '#f0f0f0',
  },
  warnings: {
    background: '#fff3cd',
    border: '1px solid #ffc107',
    borderRadius: 6,
    padding: 12,
    margin: '8px 0',
    fontSize: 13,
  },
};

export default function App() {
  const [scannedFiles, setScannedFiles] = useState<ScannedFile[]>([]);
  const [assemblyItems, setAssemblyItems] = useState<AssemblyItem[]>([]);
  const [tocItems, setTocItems] = useState<TocItem[]>([]);
  const [outputName, setOutputName] = useState('output.pdf');
  const [tocEnabled, setTocEnabled] = useState(false);
  const [building, setBuilding] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [lastResult, setLastResult] = useState<BuildResponse | null>(null);

  useEffect(() => {
    fetch('/api/files')
      .then(r => r.json())
      .then((files: ScannedFile[]) => {
        setScannedFiles(files);
        // Auto-add readme/cover files to top of assembly
        const readmeItems: AssemblyItem[] = files
          .filter(f => f.type === 'readme')
          .map(f => ({
            id: nanoid(),
            kind: ('pdf' as const),
            label: f.directory ? f.relativePath : f.name,
            path: f.path,
            includeInToc: false,
          }));
        setAssemblyItems(readmeItems);
      })
      .catch(console.error);
  }, []);

  const addFile = useCallback((file: ScannedFile) => {
    const kind = file.type === 'image' ? 'image' : 'pdf';
    // Use relativePath as label so subdir context is visible (e.g. "Hotels/receipt.pdf")
    const label = file.directory ? file.relativePath : file.name;
    const item: AssemblyItem = {
      id: nanoid(),
      kind,
      label,
      path: file.path,
      includeInToc: true,
      scale: 1.0,
    };
    setAssemblyItems(prev => [...prev, item]);
    setTocItems(prev => [...prev, { id: item.id, label }]);
  }, []);

  const addSeparator = useCallback(() => {
    const item: AssemblyItem = {
      id: nanoid(),
      kind: 'separator',
      label: 'New Section',
      separatorText: '',    // blank — user types their own text
      includeInToc: true,
    };
    setAssemblyItems(prev => [...prev, item]);
    setTocItems(prev => [...prev, { id: item.id, label: '' }]);
  }, []);

  const updateItem = useCallback((id: string, changes: Partial<AssemblyItem>) => {
    setAssemblyItems(prev =>
      prev.map(item => (item.id === id ? { ...item, ...changes } : item)),
    );
    // Sync label to TOC if it changed
    if (changes.label !== undefined) {
      setTocItems(prev =>
        prev.map(t => (t.id === id ? { ...t, label: changes.label! } : t)),
      );
    }
    // Sync includeInToc
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
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error ?? `Server error ${res.status}`);
      }
      const result = data as BuildResponse;
      setLastResult(result);
      if (result.warnings?.length) setWarnings(result.warnings);
      // Trigger download
      const a = document.createElement('a');
      a.href = `/api/download/${encodeURIComponent(result.filename)}`;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      setWarnings([`Build failed: ${String(err)}`]);
    } finally {
      setBuilding(false);
    }
  };

  const canBuild = assemblyItems.length > 0 && !building;

  return (
    <div style={styles.app(tocEnabled)}>
      {/* Header */}
      <header style={styles.header}>
        <span style={styles.title}>PDF Assembler</span>
        {lastResult && (
          <span style={{ fontSize: 13, color: '#adf', marginLeft: 8 }}>
            Last build: {lastResult.pageCount} pages → {lastResult.filename}
          </span>
        )}
        <div style={styles.headerRight}>
          <label style={styles.tocToggle}>
            <input
              type="checkbox"
              checked={tocEnabled}
              onChange={e => setTocEnabled(e.target.checked)}
            />
            Table of Contents
          </label>
          <input
            style={styles.outputInput}
            value={outputName}
            onChange={e => setOutputName(e.target.value)}
            placeholder="output.pdf"
            title="Output filename"
          />
          <button
            style={{ ...styles.buildBtn, ...(canBuild ? {} : styles.buildBtnDisabled) }}
            onClick={handleBuild}
            disabled={!canBuild}
          >
            {building ? 'Building…' : 'Build PDF'}
          </button>
        </div>
      </header>

      {/* Left: file picker */}
      <div style={styles.panel}>
        <FilePicker
          files={scannedFiles}
          onAdd={addFile}
          onAddSeparator={addSeparator}
        />
      </div>

      {/* Center: assembly */}
      <div style={styles.center}>
        {warnings.length > 0 && (
          <div style={styles.warnings}>
            <strong>Warnings:</strong>
            <ul style={{ marginTop: 4, paddingLeft: 16 }}>
              {warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        )}
        <AssemblyList
          items={assemblyItems}
          onChange={setAssemblyItems}
          onUpdate={updateItem}
          onRemove={removeItem}
        />
      </div>

      {/* Right: TOC editor (only when TOC enabled) */}
      {tocEnabled && (
        <div style={styles.panelRight}>
          <TocEditor
            tocItems={tocItems}
            assemblyItems={assemblyItems}
            onChange={setTocItems}
          />
        </div>
      )}
    </div>
  );
}
