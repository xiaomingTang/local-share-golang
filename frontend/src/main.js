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
import { ClipboardSetText, EventsOn } from "../wailsjs/runtime/runtime";
import { createToast } from "./components/toast/toast";

// UI 已在 frontend/index.html 里定义，这里只做事件绑定和数据刷新。

const els = {
  btnPick: document.getElementById("btnPick"),
  btnStop: document.getElementById("btnStop"),
  btnCtx: document.getElementById("btnCtx"),
  sharedFolder: document.getElementById("sharedFolder"),
  serverUrl: document.getElementById("serverUrl"),
  qr: document.getElementById("qr"),
};

let ctxMenuExists = false;
let currentSharedFolder = "";

const toast = createToast();

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
      return;
    }

    els.sharedFolder.textContent = info.sharedFolder || "-";
    els.serverUrl.textContent = info.url || "-";

    currentSharedFolder = info.sharedFolder || "";
    els.btnStop.disabled = !currentSharedFolder;
    els.sharedFolder.classList.toggle("is-disabled", !currentSharedFolder);
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
  await StartSharing(dir);
  await refreshServer();
});

els.btnStop.addEventListener("click", async () => {
  if (els.btnStop.disabled) return;
  await StopSharing();
  await refreshServer();
});

els.serverUrl.addEventListener("click", async () => {
  const url = (els.serverUrl.textContent || "").trim();
  if (!url || url === "-") return;
  try {
    await ClipboardSetText(url);
    toast.show("复制成功");
  } catch (e) {
    console.error(e);
  }
});

els.sharedFolder.addEventListener("click", async () => {
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

els.btnCtx.addEventListener("click", async () => {
  try {
    els.btnCtx.textContent = "处理中...";
    await SetContextMenuEnabled(!ctxMenuExists);
  } catch (e) {
    console.error(e);
  }
  await refreshContextMenu();
});

void refreshServer();
void refreshContextMenu();

// 当共享状态由“右键菜单/单实例 IPC/启动参数”等路径触发时，
// 前端不会主动调用 StartSharing，因此需要监听事件来刷新 UI。
EventsOn("serverInfoChanged", () => {
  void refreshServer();
});
