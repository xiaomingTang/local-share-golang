import toast from "react-hot-toast";
import { BrowserOpenURL, ClipboardSetText } from "../wailsjs/runtime/runtime";
import {
  ApplyDownloadedUpdate,
  CheckForUpdate,
  DownloadLatestUpdate,
  GetDownloadsDir,
  GetVersion,
  OpenFolder,
} from "../wailsjs/go/main/App";
import { toError } from "./error/utils";

export function openUrlInBrowser(url?: string) {
  const trimmedUrl = url?.trim() || "";
  if (!trimmedUrl) {
    toast.error("链接为空");
    return;
  }
  try {
    BrowserOpenURL(trimmedUrl);
  } catch (error) {
    console.error("打开链接失败:", error);
    toast.error("打开链接失败");
  }
}

export async function openFolder(path?: string) {
  const trimmedPath = path?.trim() || "";
  if (!trimmedPath || trimmedPath === "-") {
    toast.error("路径为空或无效，无法打开文件夹");
    return;
  }
  try {
    await OpenFolder(trimmedPath);
  } catch (e) {
    const err = toError(e);
    if (/不存在|not exist/i.test(err.message)) {
      toast.error("文件夹不存在（可能已被删除）");
    } else {
      toast.error("打开失败");
    }
  }
}

export async function copyText(text: string) {
  const v = (text || "").trim();
  if (!v || v === "-") return false;
  try {
    await ClipboardSetText(v);
    toast.success("复制成功");
    return true;
  } catch (e) {
    console.error(e);
    toast.error("复制失败");
    return false;
  }
}

export async function checkForUpdate() {
  const info = await CheckForUpdate();
  if (!info || !info.latestVersion) {
    throw new Error("检查失败");
  }

  if (!info.hasUpdate) {
    let v = "";
    try {
      v = await GetVersion();
    } catch {
      v = info.currentVersion || "";
    }
    const vStr = v ? `（${v}）` : "";
    toast.success(`已是最新版本${vStr}`);
    return;
  }

  const currentV = (info.currentVersion || "").trim();
  const latestV = (info.latestVersion || "").trim();

  const okDownload = window.confirm(
    `当前版本 ${currentV || "(未知)"}, 最新版本 ${latestV}，是否立即更新？`,
  );
  if (!okDownload) return;

  const result = await DownloadLatestUpdate();

  let downloadsDir = result?.downloadsDir || "";
  if (!downloadsDir) {
    try {
      downloadsDir = await GetDownloadsDir();
    } catch {
      downloadsDir = "Downloads";
    }
  }

  const okApply = window.confirm(
    `下载完成，是否立即将 app 更新为最新版？\n\n下载位置：${downloadsDir}\n\n提示：替换会导致 app 重启。`,
  );
  if (!okApply) {
    toast.success("已下载到 Downloads");
    return;
  }

  await ApplyDownloadedUpdate();
}
