import { useState, useEffect } from 'react';

interface Props {
  initialText: string;
  onSave: (text: string) => void;
  onCancel: () => void;
}

const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    background: '#fff',
    borderRadius: 12,
    padding: 24,
    width: 600,
    maxWidth: '90vw',
    boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  title: { fontSize: 16, fontWeight: 700, color: '#1a1a2e' },
  textarea: {
    width: '100%',
    minHeight: 100,
    padding: 12,
    fontSize: 16,
    fontFamily: "system-ui, -apple-system, 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif",
    border: '1px solid #ccc',
    borderRadius: 8,
    resize: 'vertical',
    outline: 'none',
    lineHeight: 1.4,
  },
  previewLabel: { fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: 1 },
  preview: {
    border: '1px solid #e0e0e0',
    borderRadius: 8,
    background: '#fff',
    height: 200,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    overflow: 'hidden',
  },
  previewText: {
    fontFamily: "system-ui, -apple-system, 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif",
    fontSize: 28,
    fontWeight: 600,
    color: '#1a1a2e',
    textAlign: 'center',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    lineHeight: 1.3,
  },
  actions: { display: 'flex', gap: 8, justifyContent: 'flex-end' },
  cancelBtn: {
    background: 'none',
    border: '1px solid #ccc',
    borderRadius: 6,
    padding: '8px 16px',
    cursor: 'pointer',
    fontSize: 14,
  },
  saveBtn: {
    background: '#1a1a2e',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '8px 16px',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 600,
  },
};

export default function SeparatorEditor({ initialText, onSave, onCancel }: Props) {
  const [text, setText] = useState(initialText);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onCancel(); return; }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { onSave(text); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancel, onSave, text]);

  return (
    <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div style={s.modal}>
        <div style={s.title}>Edit separator page</div>

        <textarea
          style={s.textarea}
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Section title (emoji and newlines are fine)"
          autoFocus
        />

        <div>
          <div style={s.previewLabel}>PREVIEW</div>
          <div style={s.preview}>
            <div style={s.previewText}>{text || <span style={{ color: '#bbb' }}>No text</span>}</div>
          </div>
        </div>

        <div style={s.actions}>
          <button style={s.cancelBtn} onClick={onCancel}>Cancel</button>
          <button style={s.saveBtn} onClick={() => onSave(text)}>Save <span style={{ opacity: 0.6, fontWeight: 400, fontSize: 11 }}>⌘↵</span></button>
        </div>
      </div>
    </div>
  );
}
