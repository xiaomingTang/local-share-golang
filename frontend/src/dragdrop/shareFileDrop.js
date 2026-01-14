import { EventsOn, OnFileDrop } from "../../wailsjs/runtime/runtime";

export function initShareFileDrop({
  setDropOverlayActive,
  tryStartSharingFromDroppedPaths,
}) {
  // 拖拽文件夹到窗口开始共享（Wails runtime 会返回系统路径）
  const isFilesDrag = (e) => {
    if (e.dataTransfer?.types) {
      for (const t of e.dataTransfer.types) {
        if (t === "Files") return true;
      }
    }
    return false;
  };
  let dragDepth = 0;

  const onDragEnter = (e) => {
    if (!isFilesDrag(e)) return;
    e.preventDefault();
    dragDepth++;
    setDropOverlayActive(true);
  };
  const onDragOver = (e) => {
    if (!isFilesDrag(e)) return;
    e.preventDefault();
    setDropOverlayActive(true);
  };
  const onDragLeave = (e) => {
    if (!isFilesDrag(e)) return;
    e.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) setDropOverlayActive(false);
  };

  window.addEventListener("dragenter", onDragEnter);
  window.addEventListener("dragover", onDragOver);
  window.addEventListener("dragleave", onDragLeave);

  // useDropTarget=true: 只有拖到带 `--wails-drop-target: drop` 的元素上才会回调
  try {
    OnFileDrop((_x, _y, paths) => {
      setDropOverlayActive(false);
      dragDepth = 0;
      void tryStartSharingFromDroppedPaths(paths);
    }, true);
  } catch (e) {
    console.error("OnFileDrop init failed", e);
  }

  // 兜底/调试：直接监听底层事件（EnableFileDrop=true 时可用）
  try {
    EventsOn("wails:file-drop", (x, y, paths) => {
      setDropOverlayActive(false);
      dragDepth = 0;
      void tryStartSharingFromDroppedPaths(paths);
    });
  } catch (e) {
    console.error("EventsOn(wails:file-drop) failed", e);
  }

  // 注意：不要在这里对 drop 做 preventDefault，否则可能阻止 Wails 的 drop 处理触发回调。
  const onDrop = () => {
    dragDepth = 0;
    setDropOverlayActive(false);
  };

  window.addEventListener("drop", onDrop);

  // 提供解绑能力（目前项目不会调用，但便于未来做 SPA/热重载时清理）
  return () => {
    window.removeEventListener("dragenter", onDragEnter);
    window.removeEventListener("dragover", onDragOver);
    window.removeEventListener("dragleave", onDragLeave);
    window.removeEventListener("drop", onDrop);
  };
}
