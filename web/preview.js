function createScrollLock() {
  return {
    locked: false,
    y: 0,
  };
}

function lockBodyScroll(state) {
  if (state.locked) return;
  state.locked = true;
  state.y = window.scrollY || 0;

  document.documentElement.classList.add("modal-open");
  document.body.classList.add("modal-open");
  document.body.style.position = "fixed";
  document.body.style.top = `-${state.y}px`;
  document.body.style.left = "0";
  document.body.style.right = "0";
  document.body.style.width = "100%";
}

function unlockBodyScroll(state) {
  if (!state.locked) return;
  state.locked = false;

  document.documentElement.classList.remove("modal-open");
  document.body.classList.remove("modal-open");
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.left = "";
  document.body.style.right = "";
  document.body.style.width = "";

  window.scrollTo(0, state.y);
}

/**
 * 预览器：封装预览模态框的打开/关闭与内容渲染。
 * 只暴露 open/close/bind（必要调用）。
 */
export function createPreviewer({ toast, escapeHtml, onDownload }) {
  const scrollState = createScrollLock();
  let currentObjectUrl = "";
  let bound = false;

  function getEls() {
    const modalEl = document.getElementById("previewModal");
    const titleEl = document.getElementById("previewTitle");
    const contentEl = document.getElementById("previewContent");
    const downloadBtnEl = document.getElementById("downloadBtn");
    return { modalEl, titleEl, contentEl, downloadBtnEl };
  }

  function ensureEls() {
    const els = getEls();
    if (!els.modalEl || !els.titleEl || !els.contentEl || !els.downloadBtnEl) {
      return null;
    }
    return els;
  }

  function revokeObjectUrl() {
    if (currentObjectUrl) {
      try {
        URL.revokeObjectURL(currentObjectUrl);
      } catch (_) {
        // ignore
      }
      currentObjectUrl = "";
    }
  }

  function close() {
    revokeObjectUrl();
    const els = getEls();
    if (els.contentEl) els.contentEl.innerHTML = "";
    if (els.modalEl) els.modalEl.style.display = "none";
    unlockBodyScroll(scrollState);
  }

  function bind() {
    if (bound) return;
    bound = true;

    const els = getEls();
    if (els.modalEl) {
      els.modalEl.addEventListener("click", (e) => {
        if (e.target === els.modalEl) close();
      });
    }

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
    });
  }

  async function open({ fileName, filePath }) {
    try {
      const els = ensureEls();
      if (!els) throw new Error("预览组件未就绪");

      revokeObjectUrl();
      els.contentEl.innerHTML = "";

      const response = await fetch(
        `/api/preview?path=${encodeURIComponent(filePath)}`,
      );
      if (!response.ok) {
        throw new Error("预览失败");
      }

      const contentType = response.headers.get("content-type") || "";
      els.titleEl.textContent = fileName;

      if (contentType.startsWith("image/")) {
        const blob = await response.blob();
        currentObjectUrl = URL.createObjectURL(blob);
        els.contentEl.innerHTML = `<img src="${currentObjectUrl}" class="preview-image" alt="${escapeHtml(
          fileName,
        )}">`;
      } else {
        const text = await response.text();
        els.contentEl.innerHTML = `<textarea class="preview-textarea" readonly spellcheck="false" wrap="off">${escapeHtml(
          text,
        )}</textarea>`;
      }

      els.downloadBtnEl.onclick = () => {
        if (typeof onDownload === "function") onDownload(fileName);
      };

      els.modalEl.style.display = "flex";
      lockBodyScroll(scrollState);

      const ta = els.contentEl.querySelector("textarea");
      if (ta) ta.focus();
    } catch (error) {
      toast?.error?.("预览文件失败");
    }
  }

  return {
    bind,
    open,
    close,
  };
}
