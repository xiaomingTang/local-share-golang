export type DirectoryItemType = "file" | "directory";

export type PreviewKind = "image" | "text" | "unsupported";

export interface PreviewInfo {
  supported: boolean;
  kind: PreviewKind;
  contentType: string | null;
  reason: string | null;
}

export interface DirectoryItem {
  name: string;
  type: DirectoryItemType;
  hidden: boolean;
  size: number;
  modified: string;
  extension: string | null;
  preview: PreviewInfo | null;
}

export interface FilesResponse {
  items: DirectoryItem[];
  rootName: string;
  currentPath: string;
  parentPath: string | null;
}

export interface PathInfoResponse {
  kind: DirectoryItemType;
  rootName: string;
  currentPath: string;
  parentPath: string | null;
  item?: DirectoryItem | null;
  items?: DirectoryItem[];
}

export interface DeleteResponse {
  deleted?: number;
  requested?: number;
  errors?: Record<string, string>;
}
