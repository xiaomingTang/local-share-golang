import { Button, Checkbox } from "@mui/material";
import type { DirectoryItem } from "../types";
import { canPreview, formatFileSize, getFileIcon } from "../utils/fileUtils";
import clsx from "clsx";

export type DirectoryListProps = {
  currentPath: string;
  items: DirectoryItem[];
  selected: ReadonlySet<string>;
  loadingText?: string;
  errorText?: string;
  emptyText?: string;
  onOpenFolder: (folderName: string) => void;
  onToggleSelect: (fileName: string, checked: boolean) => void;
  onOpenPreview: (fileName: string) => void;
  onDownloadFile: (fileName: string) => void;
  buildFilePath: (currentPath: string, fileName: string) => string;
};

export function DirectoryList(props: DirectoryListProps) {
  const {
    currentPath,
    items,
    selected,
    loadingText,
    errorText,
    emptyText,
    onOpenFolder,
    onToggleSelect,
    onOpenPreview,
    onDownloadFile,
    buildFilePath,
  } = props;

  return (
    <div className="divide-y divide-white/10">
      <div className="p-2 md:p-4 text-sm opacity-80">
        {loadingText ?? null}
        {errorText ?? null}
        {!loadingText && !errorText && items.length === 0 && emptyText}

        {items.map((it) => {
          const isDir = it.type === "directory";
          const previewable = canPreview(it);
          const isSelected = selected.has(buildFilePath(currentPath, it.name));
          const date = new Date(it.modified).toLocaleDateString();
          const size = it.type === "file" ? formatFileSize(it.size) : "";

          return (
            <div
              key={`${it.type}:${it.name}`}
              className={clsx(
                "flex items-center px-2 md:px-4 py-1.5 md:py-3",
                isSelected
                  ? "bg-blue-500/10 hover:bg-blue-500/20"
                  : "hover:bg-white/5",
              )}
              onDoubleClick={() => {
                if (isDir) onOpenFolder(it.name);
                else if (previewable) onOpenPreview(it.name);
              }}
            >
              <Checkbox
                checked={isSelected}
                onChange={(e) => onToggleSelect(it.name, e.target.checked)}
                size="small"
                edge="start"
              />
              <div className="w-6 select-none text-xl mr-2 md:mr-3">
                {getFileIcon(it)}
              </div>
              <div
                className={clsx(
                  "min-w-0 flex-1",
                  it.hidden ? "opacity-50" : "",
                )}
              >
                <div className="truncate font-medium">{it.name}</div>
                <div className="text-xs opacity-70">
                  {date}
                  <span className="inline-block w-4" />
                  {size}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isDir ? (
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => onOpenFolder(it.name)}
                  >
                    打开
                  </Button>
                ) : (
                  <>
                    {previewable && (
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => onOpenPreview(it.name)}
                      >
                        预览
                      </Button>
                    )}
                    <Button
                      size="small"
                      variant="contained"
                      onClick={() => onDownloadFile(it.name)}
                    >
                      下载
                    </Button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
