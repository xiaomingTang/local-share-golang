export type DirectoryItemType = "file" | "directory";

export interface DirectoryItem {
  name: string;
  type: DirectoryItemType;
  hidden: boolean;
  size: number;
  modified: string;
  extension: string | null;
}

export interface FilesResponse {
  items: DirectoryItem[];
  rootName: string;
  currentPath: string;
  parentPath: string | null;
}

export interface DeleteResponse {
  deleted?: number;
  requested?: number;
  errors?: Record<string, string>;
}
