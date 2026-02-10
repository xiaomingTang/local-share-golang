import { useMemo, useState } from "react";
import { Paper } from "@mui/material";
import toast from "react-hot-toast";
import { download } from "./utils/fileUtils";
import { buildCrumbs } from "./utils/path";
import {
  deletePaths,
  downloadZipWithIgnore,
  uploadFilesWithProgress,
} from "./utils/api";
import { toError } from "common/error/utils";
import { BreadcrumbNav } from "./components/BreadcrumbNav";
import { DirectoryList } from "./components/DirectoryList";
import { PreviewDialog } from "./components/PreviewDialog";
import { SelectionBar } from "./components/SelectionBar";
import { UploadPanel } from "./components/UploadPanel";
import { ChatBox } from "./components/ChatBox";
import {
  buildIgnoreList,
  DEFAULT_IGNORE_PRESETS,
  DownloadZipSettingsDialog,
  type DownloadZipSettingsValue,
} from "./components/DownloadZipSettingsDialog";
import { useDirectoryListing } from "./hooks/useDirectoryListing";
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
    rootName,
    items,
    entriesInFolder,
    filesError,
    filesValidating,
    mutateFiles,
  } = useDirectoryListing(currentPath);

  useSseDirsRefresh({
    currentPath,
    onRefresh: () => {
      void mutateFiles();
    },
  });

  const {
    selected,
    selectedInThisFolder,
    onToggleSelect,
    onSelectAll,
    clearSelection,
  } = useSelection({ currentPath, items: entriesInFolder, buildFilePath });

  const openPreview = cat(async function openPreview(fileName: string) {
    const filePath = buildFilePath(currentPath, fileName);
    await NiceModal.show(PreviewDialog, {
      title: fileName,
      filePath,
      onDownload: () => downloadFile(fileName),
    });
  });

  function onOpenFolder(folderName: string) {
    const next = currentPath ? `${currentPath}/${folderName}` : folderName;
    setPath(next);
  }

  function downloadFile(fileName: string) {
    void (async () => {
      const filePath = buildFilePath(currentPath, fileName);
      await ensureShareToken();
      const downloadUrl = withTokenQuery(
        `/api/download?path=${encodeURIComponent(filePath)}`,
      );
      download(downloadUrl, fileName);
    })();
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
      await mutateFiles();
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
      await mutateFiles();
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
  const directoryLoadingText = filesValidating ? "加载中..." : undefined;
  const directoryErrorText = filesError
    ? toError(filesError).message
    : undefined;
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6">
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
