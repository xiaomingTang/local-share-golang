import { OnFileDrop } from "wailsjs/runtime/runtime";

type InitShareFileDropArgs = {
  setDropOverlayActive: (active: boolean) => void;
  tryStartSharingFromDroppedPaths: (paths: string[]) => Promise<void> | void;
};

function isFilesDrag(e: DragEvent) {
  const types = e.dataTransfer?.types;
  if (!types) return false;
  for (const t of types) {
    if (t === "Files") return true;
  }
  return false;
}

export function initShareFileDrop({
  setDropOverlayActive,
  tryStartSharingFromDroppedPaths,
}: InitShareFileDropArgs) {
  let dragDepth = 0;

  const onDragEnter = (e: DragEvent) => {
    if (!isFilesDrag(e)) return;
    e.preventDefault();
    dragDepth++;
    setDropOverlayActive(true);
  };
  const onDragOver = (e: DragEvent) => {
    if (!isFilesDrag(e)) return;
    e.preventDefault();
    setDropOverlayActive(true);
  };
  const onDragLeave = (e: DragEvent) => {
    if (!isFilesDrag(e)) return;
    e.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) setDropOverlayActive(false);
  };

  // useDropTarget=true: 只有拖到带 `--wails-drop-target: drop` 的元素上才会回调
  OnFileDrop?.((_x: number, _y: number, paths: string[]) => {
    setDropOverlayActive(false);
    dragDepth = 0;
    void tryStartSharingFromDroppedPaths(paths);
  }, false);

  // // 兜底/调试：直接监听底层事件（EnableFileDrop=true 时可用）
  // EventsOn("wails:file-drop", (_x, _y, paths) => {
  //   setDropOverlayActive(false);
  //   dragDepth = 0;
  //   void tryStartSharingFromDroppedPaths(paths);
  // });

  /**
   * 重置 UI 状态。
   * 注意：不要在这里对 drop 做 preventDefault，否则可能阻止 Wails 的 drop 处理触发回调。
   */
  const onDrop = () => {
    dragDepth = 0;
    setDropOverlayActive(false);
  };

  window.addEventListener("dragenter", onDragEnter);
  window.addEventListener("dragover", onDragOver);
  window.addEventListener("dragleave", onDragLeave);
  window.addEventListener("drop", onDrop);

  return () => {
    window.removeEventListener("dragenter", onDragEnter);
    window.removeEventListener("dragover", onDragOver);
    window.removeEventListener("dragleave", onDragLeave);
    window.removeEventListener("drop", onDrop);
  };
}
