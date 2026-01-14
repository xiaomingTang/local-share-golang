import "./style.css";
import "./app.css";

import {
  StartSharing,
  StopSharing,
  GetServerInfo,
  PickFolder,
  CheckContextMenuExists,
  SetContextMenuEnabled,
  OpenFolder,
} from "../wailsjs/go/main/App";
import {
  BrowserOpenURL,
  ClipboardSetText,
  EventsOn,
} from "../wailsjs/runtime/runtime";
import { toast } from "./toast";
import { initShareFileDrop } from "./dragdrop/shareFileDrop";

const GITHUB_REPO_URL =
  "https://github.com/xiaomingTang/local-share-golang/releases";

const els = {
  btnPick: document.getElementById("btnPick"),
  btnStop: document.getElementById("btnStop"),
  btnCtx: document.getElementById("btnCtx"),
  githubCorner: document.getElementById("githubCorner"),
  sharedFolder: document.getElementById("sharedFolder"),
  sharedFolderAction: document.getElementById("sharedFolderAction"),
  serverUrl: document.getElementById("serverUrl"),
  serverUrlAction: document.getElementById("serverUrlAction"),
  qr: document.getElementById("qr"),
  dropOverlay: document.getElementById("dropOverlay"),
};

let ctxMenuExists = false;
let currentSharedFolder = "";

function getErrorMessage(err) {
  if (!err) return "";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message || String(err);
  if (typeof err === "object") {
    // Wails 绑定有时会返回 { message: "..." }
    const msg = err.message || err.error || err.msg;
    if (typeof msg === "string") return msg;
  }
  try {
    return String(err);
  } catch {
    return "";
  }
}

function setDropOverlayActive(active) {
  if (!els.dropOverlay) return;
  els.dropOverlay.classList.toggle("is-active", !!active);
}

async function tryStartSharingFromDroppedPaths(paths) {
  const list = Array.isArray(paths) ? paths.filter(Boolean) : [];
  if (list.length === 0) {
    toast.show("没有识别到可共享的文件夹路径（请拖到提示面板上）");
    return;
  }

  let lastErr = null;
  for (const p of list) {
    try {
      await StartSharing(p);
      await refreshServer();
      toast.show("已开始共享");
      return;
    } catch (e) {
      lastErr = e;
    }
  }

  const msg = getErrorMessage(lastErr);
  if (/不是文件夹/.test(msg)) {
    toast.show("请拖拽文件夹开始共享");
  } else if (msg) {
    toast.show(msg);
  } else {
    toast.show("开始共享失败");
  }
}

async function copyText(text) {
  const v = (text || "").trim();
  if (!v || v === "-") return false;
  try {
    await ClipboardSetText(v);
    toast.show("复制成功");
    return true;
  } catch (e) {
    console.error(e);
    toast.show("复制失败");
    return false;
  }
}

async function refreshServer() {
  try {
    const info = await GetServerInfo();
    if (!info) {
      els.sharedFolder.textContent = "-";
      els.serverUrl.textContent = "-";
      els.qr.removeAttribute("src");

      currentSharedFolder = "";
      els.btnStop.disabled = true;

      els.sharedFolder.classList.add("is-disabled");
      els.sharedFolderAction.disabled = true;

      els.serverUrl.classList.add("is-disabled");
      els.serverUrlAction.disabled = true;
      return;
    }

    els.sharedFolder.textContent = info.sharedFolder || "-";
    els.serverUrl.textContent = info.url || "-";

    currentSharedFolder = info.sharedFolder || "";

    const urlText = (info.url || "").trim();
    const hasShare = !!currentSharedFolder;
    const hasUrl = !!urlText;

    els.btnStop.disabled = !hasShare;

    els.sharedFolder.classList.toggle("is-disabled", !hasShare);
    els.sharedFolderAction.disabled = !hasShare;

    els.serverUrl.classList.toggle("is-disabled", !hasUrl);
    els.serverUrlAction.disabled = !hasUrl;

    if (info.qrCode) {
      els.qr.setAttribute("src", info.qrCode);
    } else {
      els.qr.removeAttribute("src");
    }
  } catch (e) {
    console.error(e);
  }
}

async function refreshContextMenu() {
  try {
    const status = await CheckContextMenuExists();
    ctxMenuExists = !!status?.exists;
    els.btnCtx.textContent = ctxMenuExists
      ? "已启用（点击移除）"
      : "未启用（点击启用）";
    els.btnCtx.classList.toggle("ctx-enabled", ctxMenuExists);
    els.btnCtx.classList.toggle("ctx-disabled", !ctxMenuExists);
  } catch (e) {
    console.error(e);
    els.btnCtx.textContent = "检测失败（点击重试）";
  }
}

els.btnPick.addEventListener("click", async () => {
  const dir = await PickFolder();
  if (!dir) return;
  try {
    await StartSharing(dir);
  } catch (e) {
    toast.show(getErrorMessage(e) || "开始共享失败");
  }
  await refreshServer();
});

els.btnStop.addEventListener("click", async () => {
  if (els.btnStop.disabled) return;
  await StopSharing();
  await refreshServer();
});

els.serverUrl.addEventListener("click", async () => {
  const url = (els.serverUrl.textContent || "").trim();
  await copyText(url);
});

els.sharedFolder.addEventListener("click", async () => {
  const path = (currentSharedFolder || "").trim();
  await copyText(path);
});

els.sharedFolderAction.addEventListener("click", async () => {
  if (els.sharedFolderAction.disabled) return;
  const path = (currentSharedFolder || "").trim();
  if (!path) return;
  try {
    await OpenFolder(path);
  } catch (e) {
    console.error(e);
    const raw = (e && (e.message || (e.toString && e.toString()))) || "";
    const msg = String(raw);
    if (/不存在|not exist/i.test(msg)) {
      toast.show("文件夹不存在（可能已被删除）");
    } else {
      toast.show("打开失败");
    }
  }
});

els.serverUrlAction.addEventListener("click", async () => {
  if (els.serverUrlAction.disabled) return;
  const url = (els.serverUrl.textContent || "").trim();
  if (!url || url === "-") return;
  try {
    BrowserOpenURL(url);
  } catch (e) {
    console.error(e);
    toast.show("打开失败");
  }
});

els.btnCtx.addEventListener("click", async () => {
  try {
    els.btnCtx.textContent = "处理中...";
    await SetContextMenuEnabled(!ctxMenuExists);
  } catch (e) {
    console.error(e);
  }
  await refreshContextMenu();
});

els.githubCorner?.addEventListener("click", (e) => {
  e.preventDefault();
  try {
    BrowserOpenURL(GITHUB_REPO_URL);
  } catch (e) {
    console.error(e);
    toast.show("打开失败");
  }
});

void refreshServer();
void refreshContextMenu();

initShareFileDrop({
  setDropOverlayActive,
  tryStartSharingFromDroppedPaths,
});

// 当共享状态由“右键菜单/单实例 IPC/启动参数”等路径触发时，
// 前端不会主动调用 StartSharing，因此需要监听事件来刷新 UI。
EventsOn("serverInfoChanged", () => {
  void refreshServer();
});
