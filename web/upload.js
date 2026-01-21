function hasFileDrag(e) {
  const types = Array.from(e.dataTransfer?.types || []);
  return types.includes("Files") || (e.dataTransfer?.files?.length || 0) > 0;
}

/**
 * 上传器：封装拖拽/选择文件上传、进度展示与回调。
 * 只暴露 bind/uploadFiles（必要调用）。
 */
export function createUploader({ toast, getCurrentPath, onUploaded }) {
  let bound = false;

  function getEls() {
    const dropZoneEl = document.getElementById("dropZone");
    const fileInputEl = document.getElementById("fileInput");
    const uploadProgressEl = document.getElementById("uploadProgress");
    const progressFillEl = document.getElementById("progressFill");
    const progressTextEl = document.getElementById("progressText");
    return {
      dropZoneEl,
      fileInputEl,
      uploadProgressEl,
      progressFillEl,
      progressTextEl,
    };
  }

  function ensureEls() {
    const els = getEls();
    if (!els.dropZoneEl || !els.fileInputEl) return null;
    return els;
  }

  async function uploadFiles(files) {
    const fileList = Array.from(files || []);
    if (fileList.length === 0) return;

    const els = ensureEls();
    if (!els) {
      toast?.error?.("上传组件未就绪");
      return;
    }

    const currentPath =
      typeof getCurrentPath === "function" ? getCurrentPath() : "";

    const formData = new FormData();
    formData.append("path", currentPath || "");
    for (const file of fileList) {
      formData.append("files", file);
    }

    try {
      if (els.uploadProgressEl) els.uploadProgressEl.style.display = "block";
      if (els.progressFillEl) els.progressFillEl.style.width = "0%";
      if (els.progressTextEl) els.progressTextEl.textContent = "准备上传...";

      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener("progress", (e) => {
        if (!e.lengthComputable) return;
        const percent = (e.loaded / e.total) * 100;
        if (els.progressFillEl) els.progressFillEl.style.width = `${percent}%`;
        if (els.progressTextEl)
          els.progressTextEl.textContent = `上传中... ${Math.round(percent)}%`;
      });

      xhr.addEventListener("load", () => {
        let payload = null;
        try {
          payload = xhr.responseText ? JSON.parse(xhr.responseText) : null;
        } catch (_) {
          payload = null;
        }

        if (xhr.status === 200) {
          toast?.success?.(payload?.message || "上传成功");
          if (typeof onUploaded === "function") onUploaded();
        } else {
          const errMsg = payload?.error || payload?.message || "上传失败";
          toast?.error?.(errMsg);
        }

        if (els.uploadProgressEl) els.uploadProgressEl.style.display = "none";
        if (els.fileInputEl) els.fileInputEl.value = "";
      });

      xhr.addEventListener("error", () => {
        toast?.error?.("上传文件失败");
        if (els.uploadProgressEl) els.uploadProgressEl.style.display = "none";
      });

      xhr.open("POST", "/api/upload");
      xhr.send(formData);
    } catch (error) {
      toast?.error?.("上传文件失败");
      if (els.uploadProgressEl) els.uploadProgressEl.style.display = "none";
    }
  }

  function bind() {
    if (bound) return;
    bound = true;

    const els = ensureEls();
    if (els?.dropZoneEl) {
      els.dropZoneEl.addEventListener("dragover", (e) => {
        e.preventDefault();
        els.dropZoneEl.classList.add("drag-over");
      });

      els.dropZoneEl.addEventListener("dragleave", (e) => {
        e.preventDefault();
        els.dropZoneEl.classList.remove("drag-over");
      });

      els.dropZoneEl.addEventListener("drop", (e) => {
        e.preventDefault();
        e.stopPropagation();
        els.dropZoneEl.classList.remove("drag-over");
        const files = Array.from(e.dataTransfer?.files || []);
        uploadFiles(files);
      });

      els.dropZoneEl.addEventListener("click", (e) => {
        if (e.target && e.target.closest && e.target.closest("button")) return;
        els.fileInputEl?.click?.();
      });

      els.dropZoneEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          els.fileInputEl?.click?.();
        }
      });
    }

    // 全局拖拽：把文件拖到页面任意位置也能上传
    let dragDepth = 0;
    const showGlobalDrag = () =>
      document.getElementById("dropZone")?.classList?.add?.("drag-over");
    const hideGlobalDrag = () =>
      document.getElementById("dropZone")?.classList?.remove?.("drag-over");

    window.addEventListener("dragenter", (e) => {
      if (!hasFileDrag(e)) return;
      if (e.target && e.target.closest && e.target.closest("#dropZone")) return;
      e.preventDefault();
      dragDepth++;
      showGlobalDrag();
    });

    window.addEventListener("dragover", (e) => {
      if (!hasFileDrag(e)) return;
      if (e.target && e.target.closest && e.target.closest("#dropZone")) return;
      e.preventDefault();
      showGlobalDrag();
    });

    window.addEventListener("dragleave", (e) => {
      if (!hasFileDrag(e)) return;
      if (e.target && e.target.closest && e.target.closest("#dropZone")) return;
      e.preventDefault();
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) hideGlobalDrag();
    });

    window.addEventListener("drop", (e) => {
      if (!hasFileDrag(e)) return;
      if (e.target && e.target.closest && e.target.closest("#dropZone")) return;
      e.preventDefault();
      dragDepth = 0;
      hideGlobalDrag();

      const files = Array.from(e.dataTransfer?.files || []);
      if (files.length === 0) {
        toast?.error?.("没有检测到可上传的文件（暂不支持拖拽文件夹）");
        return;
      }
      uploadFiles(files);
    });

    if (els?.fileInputEl) {
      els.fileInputEl.addEventListener("change", (e) => {
        const files = Array.from(e.target.files || []);
        uploadFiles(files);
      });
    }
  }

  return {
    bind,
    uploadFiles,
  };
}
