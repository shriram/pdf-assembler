// PreviewSource is exported so App.tsx can import it
export type PreviewSource =
  | { type: 'assembly'; blobUrl: string }
  | { type: 'file'; path: string; kind: 'image' | 'pdf'; label: string }
  | null;

interface Props {
  source: PreviewSource;
  previewing?: boolean;
}

const s: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
    background: '#e8e8e8',
  },
  header: {
    fontSize: 11,
    fontWeight: 700,
    color: '#888',
    letterSpacing: 1,
    padding: '12px 16px 8px',
    flexShrink: 0,
  },
  placeholder: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#aaa',
    fontSize: 13,
    textAlign: 'center',
    padding: 32,
  },
  iframeWrap: {
    flex: 1,
    padding: '0 12px 12px',
    display: 'flex',
    minHeight: 0,
  },
  scrollArea: {
    flex: 1,
    overflowY: 'auto',
    padding: '0 16px 16px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
  },
  scaleNote: {
    fontSize: 11,
    color: '#666',
    alignSelf: 'flex-start',
  },
  pageMock: {
    aspectRatio: '612/792',
    background: 'white',
    boxShadow: '0 2px 16px rgba(0,0,0,0.2)',
    position: 'relative',
    width: '100%',
    maxWidth: 400,
    flexShrink: 0,
  },
  marginArea: {
    position: 'absolute',
    top: '9.09%',
    left: '11.76%',
    right: '11.76%',
    bottom: '9.09%',
    border: '1px dashed #e0e0e0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  spinner: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#888',
    fontSize: 13,
  },
};

function previewApiUrl(path: string) {
  return `/api/preview?p=${encodeURIComponent(path)}`;
}

function renderFileUrl(path: string) {
  return `/api/render-file?p=${encodeURIComponent(path)}`;
}

function ImagePreview({ path, label }: { path: string; label: string }) {
  return (
    <div style={s.scrollArea}>
      <div style={s.pageMock}>
        <div style={s.marginArea}>
          <img
            src={previewApiUrl(path)}
            alt={label}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          />
        </div>
      </div>
    </div>
  );
}

function IframePreview({ src, label }: { src: string; label: string }) {
  return (
    <div style={s.iframeWrap}>
      <iframe
        src={src}
        style={{ flex: 1, border: '1px solid #ccc', borderRadius: 4 }}
        title={label}
      />
    </div>
  );
}

export default function PreviewPanel({ source, previewing }: Props) {
  if (previewing) {
    return (
      <div style={s.root}>
        <div style={s.header}>PREVIEW</div>
        <div style={s.spinner}>Building preview…</div>
      </div>
    );
  }

  if (!source) {
    return (
      <div style={s.root}>
        <div style={s.header}>PREVIEW</div>
        <div style={s.placeholder}>
          Click a file on the left to preview it, or use "Preview Assembly" to see the assembled document.
        </div>
      </div>
    );
  }

  if (source.type === 'assembly') {
    return (
      <div style={s.root}>
        <div style={s.header}>PREVIEW — assembled document</div>
        <IframePreview src={source.blobUrl} label="assembled PDF" />
      </div>
    );
  }

  // type === 'file'
  const { path, kind, label } = source;
  const title = `PREVIEW — ${label}`;

  if (kind === 'image') {
    return (
      <div style={s.root}>
        <div style={s.header}>{title}</div>
        <ImagePreview path={path} label={label} />
      </div>
    );
  }

  return (
    <div style={s.root}>
      <div style={s.header}>{title}</div>
      <IframePreview src={renderFileUrl(path)} label={label} />
    </div>
  );
}
