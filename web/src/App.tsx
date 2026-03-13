import { useMemo, useState } from "react";
import { Alert, Button, Paper } from "@mui/material";
import toast from "react-hot-toast";
import useSWR from "swr";
import { download } from "./utils/fileUtils";
import { buildCrumbs } from "./utils/path";
import {
  deletePaths,
  downloadZipWithIgnore,
  fetchPathInfo,
  uploadFilesWithProgress,
} from "./utils/api";
import { toError } from "common/error/utils";
import { BreadcrumbNav } from "./components/BreadcrumbNav";
import { DirectoryList } from "./components/DirectoryList";
import { ImageFilePage } from "./components/ImageFilePage";
import { PreviewDialog } from "./components/PreviewDialog";
import { SelectionBar } from "./components/SelectionBar";
import { TextFilePage } from "./components/TextFilePage";
import { UploadPanel } from "./components/UploadPanel";
import { UnsupportedFilePage } from "./components/UnsupportedFilePage";
import { ChatBox } from "./components/ChatBox";
import {
  buildIgnoreList,
  DEFAULT_IGNORE_PRESETS,
  DownloadZipSettingsDialog,
  type DownloadZipSettingsValue,
} from "./components/DownloadZipSettingsDialog";
import { useSelection } from "./hooks/useSelection";
import { useSseDirsRefresh } from "./hooks/useSseDirsRefresh";
import { useSyncedPath } from "./hooks/useSyncedPath";
import { useRemoteSetting } from "common/storage";
import NiceModal from "@ebay/nice-modal-react";
import { cat } from "common/error/catch-and-toast";
import { ensureShareToken, withTokenQuery } from "./utils/auth";

function buildFilePath(currentPath: string, fileName: string) {
  return currentPath ? `${currentPath}/${fileName}` : fileName;
}

function getParentPath(path: string) {
  const parts = (path || "").split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

const DOWNLOAD_SETTINGS_KEY = "localshare.web.downloadZipSettings.v1" as const;

const defaultDownloadSettings: DownloadZipSettingsValue = {
  enabledPresetKeys: DEFAULT_IGNORE_PRESETS.filter(
    (p) => p.defaultSelected,
  ).map((p) => p.key),
  customIgnore: "",
};

export default function App() {
  const { currentPath, setPath } = useSyncedPath();
  const [uploadPct, setUploadPct] = useState<number>(0);
  const [uploading, setUploading] = useState<boolean>(false);
  const [downloadSettings, setDownloadSettings] =
    useRemoteSetting<DownloadZipSettingsValue>(
      DOWNLOAD_SETTINGS_KEY,
      defaultDownloadSettings,
    );

  const {
    data: pathInfo,
    error: pathError,
    isValidating: pathValidating,
    mutate: mutatePathInfo,
  } = useSWR(["path-info", currentPath], async ([, path]) => fetchPathInfo(path));

  const rootName = pathInfo?.rootName || "根目录";
  const isDirectory = pathInfo?.kind === "directory";
  const currentFile = pathInfo?.kind === "file" ? pathInfo.item || null : null;
  const items = isDirectory && Array.isArray(pathInfo?.items) ? pathInfo.items : [];
  const entriesInFolder = items;
  const refreshPath = currentFile ? pathInfo?.parentPath || "" : currentPath;

  useSseDirsRefresh({
    currentPath: refreshPath,
    onRefresh: () => {
      void mutatePathInfo();
    },
  });

  const {
    selected,
    selectedInThisFolder,
    onToggleSelect,
    onSelectAll,
    clearSelection,
  } = useSelection({ currentPath, items: entriesInFolder, buildFilePath });

  const openPreviewByPath = cat(async function openPreviewByPath(
    filePath: string,
    title: string,
  ) {
    await NiceModal.show(PreviewDialog, {
      title,
      filePath,
      onDownload: () => downloadPath(filePath, title),
    });
  });

  const openPreview = cat(async function openPreview(fileName: string) {
    const filePath = buildFilePath(currentPath, fileName);
    await openPreviewByPath(filePath, fileName);
  });

  function onOpenFolder(folderName: string) {
    const next = currentPath ? `${currentPath}/${folderName}` : folderName;
    setPath(next);
  }

  function openFilePage(fileName: string) {
    const filePath = buildFilePath(currentPath, fileName);
    setPath(filePath);
  }

  function downloadPath(filePath: string, fileName: string) {
    void (async () => {
      await ensureShareToken();
      const downloadUrl = withTokenQuery(
        `/api/download?path=${encodeURIComponent(filePath)}`,
      );
      download(downloadUrl, fileName);
    })();
  }

  function downloadFile(fileName: string) {
    const filePath = buildFilePath(currentPath, fileName);
    downloadPath(filePath, fileName);
  }

  async function downloadSelected() {
    const paths = Array.from(selected);
    if (paths.length === 0) return;

    const typeByPath = new Map(
      entriesInFolder.map((it) => [
        buildFilePath(currentPath, it.name),
        it.type,
      ]),
    );

    if (paths.length === 1 && typeByPath.get(paths[0]) === "file") {
      const relPath = paths[0];
      const fileName =
        (relPath || "").split("/").filter(Boolean).pop() || "download";
      await ensureShareToken();
      const downloadUrl = withTokenQuery(
        `/api/download?path=${encodeURIComponent(relPath)}`,
      );
      download(downloadUrl, fileName);
      return;
    }

    const t = toast.loading("打包中...");
    try {
      const ignore = buildIgnoreList(downloadSettings);
      const { blob, fileName } = await downloadZipWithIgnore({ paths, ignore });
      const url = URL.createObjectURL(blob);
      download(url, fileName);
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success("开始下载");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "批量下载失败";
      toast.error(msg);
    } finally {
      toast.dismiss(t);
    }
  }

  async function deleteSelected() {
    const paths = Array.from(selected);
    if (paths.length === 0) return;
    if (
      !window.confirm(
        `确认删除已选 ${paths.length} 项（文件/文件夹）？Windows 下会移入回收站。`,
      )
    ) {
      return;
    }

    const t = toast.loading("删除中...");
    try {
      const payload = await deletePaths(paths);
      const deleted = payload.deleted ?? 0;
      const requested = payload.requested ?? paths.length;
      const errCount = payload.errors ? Object.keys(payload.errors).length : 0;
      if (errCount > 0) {
        toast.error(
          `删除完成：成功 ${deleted} / ${requested}，失败 ${errCount}`,
        );
      } else {
        toast.success(`已删除 ${deleted} 项`);
      }
      clearSelection();
      await mutatePathInfo();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "批量删除失败";
      toast.error(msg);
    } finally {
      toast.dismiss(t);
    }
  }

  async function handleUpload(fileList: FileList | File[]) {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;

    setUploading(true);
    setUploadPct(0);
    const t = toast.loading("上传中...");
    try {
      await uploadFilesWithProgress({
        path: currentPath,
        files,
        onProgress: (pct) => setUploadPct(pct),
      });
      toast.success("上传成功");
      await mutatePathInfo();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "上传失败";
      toast.error(msg);
    } finally {
      toast.dismiss(t);
      setUploading(false);
      window.setTimeout(() => setUploadPct(0), 400);
    }
  }

  const crumbs = useMemo(
    () => buildCrumbs(currentPath, rootName),
    [currentPath, rootName],
  );

  const targetLabel = currentPath ? `${rootName}/${currentPath}` : rootName;
  const directoryLoadingText = pathValidating ? "加载中..." : undefined;
  const directoryErrorText = pathError ? toError(pathError).message : undefined;
  const parentPath = getParentPath(currentPath);

  if (pathError) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-6">
        <Paper
          elevation={0}
          sx={{
            borderRadius: 2,
            backgroundColor: "rgba(255, 255, 255, 0.06)",
            p: 3,
          }}
        >
          <Alert severity="error" sx={{ mb: 2 }}>
            {toError(pathError).message}
          </Alert>
          <Button variant="outlined" onClick={() => setPath(parentPath)}>
            返回上一页
          </Button>
        </Paper>
      </div>
    );
  }

  if (!pathInfo && pathValidating) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-6">
        <Paper
          elevation={0}
          sx={{
            borderRadius: 2,
            backgroundColor: "rgba(255, 255, 255, 0.06)",
            p: 3,
          }}
        >
          加载中...
        </Paper>
      </div>
    );
  }

  if (currentFile) {
    const downloadCurrentFile = () => downloadPath(currentPath, currentFile.name);

    if (currentFile.preview?.supported && currentFile.preview.kind === "image") {
      return (
        <ImageFilePage
          rootName={rootName}
          currentPath={currentPath}
          item={currentFile}
          onNavigate={setPath}
          onDownload={downloadCurrentFile}
        />
      );
    }

    if (currentFile.preview?.supported && currentFile.preview.kind === "text") {
      return (
        <TextFilePage
          rootName={rootName}
          currentPath={currentPath}
          item={currentFile}
          onNavigate={setPath}
          onDownload={downloadCurrentFile}
        />
      );
    }

    return (
      <UnsupportedFilePage
        rootName={rootName}
        currentPath={currentPath}
        item={currentFile}
        onNavigate={setPath}
        onDownload={downloadCurrentFile}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <SelectionBar
        totalInFolder={selectedInThisFolder.total}
        selectedInFolder={selectedInThisFolder.selectedCount}
        selectedTotal={selected.size}
        onSelectAll={onSelectAll}
        onDownloadSelected={() => void downloadSelected()}
        onOpenChat={cat(async () => NiceModal.show(ChatBox))}
        onOpenDownloadSettings={cat(async () =>
          NiceModal.show(DownloadZipSettingsDialog, {
            value: downloadSettings,
            onSave: (v) => setDownloadSettings(v),
          }),
        )}
        onDeleteSelected={() => void deleteSelected()}
        onClearSelection={clearSelection}
      />

      <Paper
        className="mb-4 overflow-hidden"
        elevation={0}
        sx={{
          borderRadius: 2,
          backgroundColor: "rgba(255, 255, 255, 0.06)",
        }}
      >
        <BreadcrumbNav crumbs={crumbs} onNavigate={setPath} />
        <DirectoryList
          currentPath={currentPath}
          items={items}
          selected={selected}
          loadingText={directoryLoadingText}
          errorText={directoryErrorText}
          emptyText="此文件夹为空"
          onOpenFolder={onOpenFolder}
          onOpenFilePage={openFilePage}
          onToggleSelect={onToggleSelect}
          onOpenPreview={openPreview}
          onDownloadFile={downloadFile}
          buildFilePath={buildFilePath}
        />
      </Paper>
      <UploadPanel
        targetLabel={targetLabel}
        uploading={uploading}
        uploadPct={uploadPct}
        onUpload={handleUpload}
      />
    </div>
  );
}
