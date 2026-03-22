// Shared types used by both server and client

export type FileType = 'pdf' | 'image' | 'readme';

export interface ScannedFile {
  name: string;
  type: FileType;
  path: string;           // absolute path on disk (server use only)
  relativePath: string;   // path relative to CWD, e.g. "Hotels/receipt.pdf"
  directory: string;      // relative dir portion, e.g. "Hotels" or "" for root
  embeddable: boolean;    // false for .md, .txt, etc. — shown but can't be built in
}

export type AssemblyItemKind = 'pdf' | 'image' | 'separator';

export interface AssemblyItem {
  id: string;                // nanoid, client-generated
  kind: AssemblyItemKind;
  label: string;             // display label, editable
  path?: string;             // absolute path; absent for separators
  enabled?: boolean;         // if false, item is skipped in build/preview (default true)
  includeInToc: boolean;
  scale?: number;            // 0.5–1.0, images only; default 1.0
  separatorText?: string;    // multi-line, emoji OK
}

export interface TocItem {
  id: string;    // matches AssemblyItem.id
  label: string; // may differ from AssemblyItem.label (user-editable)
}

export interface BuildRequest {
  items: AssemblyItem[];
  tocItems: TocItem[];   // empty = no TOC page
  outputName: string;
}

export interface BuildResponse {
  filename: string;
  pageCount: number;
  warnings: string[];
}

export type FilesResponse = ScannedFile[];
