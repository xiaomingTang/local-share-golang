export function autoFocus(element?: HTMLElement | null) {
  if (!element) return;

  const tryFocus = () => {
    if (!element.isConnected) return;
    try {
      element.focus({ preventScroll: true });
    } catch {
      element.focus();
    }
  };

  // 先尝试一次（下一帧，确保节点已完成渲染）
  requestAnimationFrame(tryFocus);

  // 如果窗口还没获得焦点（Wails/Windows 常见），在窗口聚焦时再试一次
  if (!document.hasFocus()) {
    window.addEventListener(
      "focus",
      () => {
        requestAnimationFrame(tryFocus);
      },
      { once: true },
    );
  }
}
