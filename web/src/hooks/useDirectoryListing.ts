import useSWR from "swr";
import type { DirectoryItem } from "../types";
import { fetchFiles } from "../utils/api";

export function useDirectoryListing(currentPath: string) {
  const {
    data: filesData,
    error: filesError,
    isValidating: filesValidating,
    mutate: mutateFiles,
  } = useSWR(["files", currentPath], async ([, path]) => fetchFiles(path));

  const rootName = filesData?.rootName || "根目录";
  const items: DirectoryItem[] = Array.isArray(filesData?.items)
    ? filesData!.items
    : [];

  // 可选择项：文件 + 文件夹
  const entriesInFolder = items;

  return {
    rootName,
    items,
    entriesInFolder,
    filesError,
    filesValidating,
    mutateFiles,
  };
}
