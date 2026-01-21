let toastEl = null;
let hideTimerId = 0;

function ensureToastElement() {
  if (toastEl) return toastEl;
  if (!document.body) return null;

  toastEl = document.createElement("div");
  toastEl.className = "local-share-toast";
  toastEl.setAttribute("role", "status");
  toastEl.setAttribute("aria-live", "polite");
  document.body.appendChild(toastEl);
  return toastEl;
}

function show(type, message, options = {}) {
  const delayMs = typeof options.delayMs === "number" ? options.delayMs : 3000;
  const el = ensureToastElement();
  if (!el) {
    // 极早期（body 尚未就绪）兜底：等 DOMReady 再显示最后一次
    document.addEventListener(
      "DOMContentLoaded",
      () => show(type, message, options),
      { once: true },
    );
    return;
  }

  const safeText = String(message ?? "");
  el.textContent = safeText;
  el.className = `local-share-toast local-share-toast--${type} is-visible`;

  if (hideTimerId) window.clearTimeout(hideTimerId);
  hideTimerId = window.setTimeout(
    () => {
      el.classList.remove("is-visible");
      // 让过渡动画跑完再 display none
      window.setTimeout(() => {
        if (el && !el.classList.contains("is-visible")) {
          el.style.display = "none";
          // 重置 inline display，避免下一次 show 被覆盖
          window.setTimeout(() => {
            if (el) el.style.display = "";
          }, 0);
        }
      }, 180);
    },
    Math.max(0, delayMs),
  );
}

export const toast = {
  success(message, options) {
    show("success", message, options);
  },
  error(message, options) {
    show("error", message, options);
  },
};
