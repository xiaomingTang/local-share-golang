"use strict";
class WebFileManager {
  constructor() {
    this.currentPath = "";
    this.rootName = "根目录";
    this.elements = {
      fileList: document.getElementById("fileList"),
      uploadTarget: document.getElementById("uploadTarget"),
      dropZone: document.getElementById("dropZone"),
      fileInput: document.getElementById("fileInput"),
      uploadProgress: document.getElementById("uploadProgress"),
      progressFill: document.getElementById("progressFill"),
      progressText: document.getElementById("progressText"),
      previewModal: document.getElementById("previewModal"),
      previewTitle: document.getElementById("previewTitle"),
      previewContent: document.getElementById("previewContent"),
      downloadBtn: document.getElementById("downloadBtn"),
      notification: document.getElementById("notification"),
    };
    this.bindEvents();
    const initialPath = this.getPathFromUrl();
    this.loadFiles(initialPath);
  }
  updateUploadTarget() {
    const normalized = (this.currentPath || "").trim();
    const label = normalized ? `${this.rootName}/${normalized}` : this.rootName;
    this.elements.uploadTarget.textContent = `上传到：${label}`;
  }
  getPathFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get("path") || "";
  }
  syncPathToUrl(path) {
    const url = new URL(window.location.href);
    if (path) {
      url.searchParams.set("path", path);
    } else {
      url.searchParams.delete("path");
    }
    window.history.replaceState(null, "", url);
  }
  bindEvents() {
    // 文件拖拽上传
    this.elements.dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      this.elements.dropZone.classList.add("drag-over");
    });
    this.elements.dropZone.addEventListener("dragleave", (e) => {
      e.preventDefault();
      this.elements.dropZone.classList.remove("drag-over");
    });
    this.elements.dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      this.elements.dropZone.classList.remove("drag-over");
      const files = Array.from(e.dataTransfer?.files || []);
      this.uploadFiles(files);
    });
    // 文件选择上传
    this.elements.fileInput.addEventListener("change", (e) => {
      const files = Array.from(e.target.files || []);
      this.uploadFiles(files);
    });
    // 点击预览弹窗外部关闭
    this.elements.previewModal.addEventListener("click", (e) => {
      if (e.target === this.elements.previewModal) {
        closePreview();
      }
    });
    // ESC 关闭预览弹窗
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closePreview();
      }
    });
  }
  async loadFiles(path = "") {
    try {
      this.elements.fileList.innerHTML = '<div class="loading">加载中...</div>';
      const response = await fetch(
        `/api/files?path=${encodeURIComponent(path)}`
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "加载文件失败");
      }
      this.currentPath = path;
      this.rootName = data.rootName || this.rootName;
      this.syncPathToUrl(this.currentPath);
      this.updateUploadTarget();
      this.renderFileList(data);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "加载文件列表失败";
      // 即使路径无效，也要把它写回 URL，刷新后仍能复现并提示
      this.currentPath = path;
      this.syncPathToUrl(this.currentPath);
      this.updateUploadTarget();
      this.elements.fileList.innerHTML = `
        <div class="file-item breadcrumb-row">
          <div class="file-info">
            <div class="file-name">${buildBreadcrumbHtml(
              this.currentPath,
              this.rootName
            )}</div>
          </div>
        </div>
        <div class="file-item error-state">${escapeHtml(message)}</div>
      `;
      this.showNotification(message, "error");
    }
  }
  renderFileList(data) {
    const { items, parentPath } = data;
    let html = "";
    // 以面包屑导航替代“返回上级目录”行
    html += `
          <div class="file-item breadcrumb-row">
            <div class="file-info">
              <div class="file-name">${buildBreadcrumbHtml(
                this.currentPath,
                this.rootName
              )}</div>
            </div>
          </div>
        `;
    // 渲染文件和文件夹
    for (const item of items) {
      const icon = getFileIcon(item);
      const size = item.type === "file" ? formatFileSize(item.size) : "";
      const date = new Date(item.modified).toLocaleDateString();
      const nameJs = JSON.stringify(item.name);
      const isDir = item.type === "directory";
      const previewable = canPreview(item);

      const itemClass = item.hidden ? "file-item is-hidden" : "file-item";
      const dblClickHandler = isDir
        ? `ondblclick='if(event.target.closest("button")) return; fileManager.openFolder(${nameJs})'`
        : previewable
        ? `ondblclick='if(event.target.closest("button")) return; fileManager.previewFile(${nameJs})'`
        : "";
      html += `
                <div class="${itemClass}" ${dblClickHandler}>
                    <div class="file-icon ${getFileIconClass(
                      item
                    )}">${icon}</div>
                    <div class="file-info">
                        <div class="file-name">${escapeHtml(item.name)}</div>
                        <div class="file-details">${date}${
        !!size ? "\u00A0\u00A0\u00A0\u00A0\u00A0" : ""
      }${size}</div>
                    </div>
                    <div class="file-actions">
                        ${
                          item.type === "directory"
                            ? `<button class="btn btn-outline btn-small" onclick='event.stopPropagation(); fileManager.openFolder(${nameJs})'>打开</button>`
                            : `
                                ${
                                  canPreview(item)
                                    ? `<button class="btn btn-secondary btn-small" onclick='event.stopPropagation(); fileManager.previewFile(${nameJs})'>预览</button>`
                                    : ""
                                }
                                <button class="btn btn-primary btn-small" onclick='event.stopPropagation(); fileManager.downloadFile(${nameJs})'>下载</button>
                            `
                        }
                    </div>
                </div>
            `;
    }
    if (items.length === 0) {
      html += '<div class="file-item empty">此文件夹为空</div>';
    }
    this.elements.fileList.innerHTML = html;
  }
  openFolder(folderName) {
    const newPath = this.currentPath
      ? `${this.currentPath}/${folderName}`
      : folderName;
    this.loadFiles(newPath);
  }
  async previewFile(fileName) {
    try {
      const filePath = this.currentPath
        ? `${this.currentPath}/${fileName}`
        : fileName;
      const response = await fetch(
        `/api/preview?path=${encodeURIComponent(filePath)}`
      );
      if (!response.ok) {
        throw new Error("预览失败");
      }
      const contentType = response.headers.get("content-type") || "";
      const fileExt = fileName.split(".").pop()?.toLowerCase() || "";
      this.elements.previewTitle.textContent = fileName;
      if (contentType.startsWith("image/")) {
        const blob = await response.blob();
        const imageUrl = URL.createObjectURL(blob);
        this.elements.previewContent.innerHTML = `<img src="${imageUrl}" class="preview-image" alt="${fileName}">`;
      } else {
        const text = await response.text();
        this.elements.previewContent.innerHTML = `<div class="preview-text">${escapeHtml(
          text
        )}</div>`;
      }
      // 设置下载按钮
      this.elements.downloadBtn.onclick = () => this.downloadFile(fileName);
      this.elements.previewModal.style.display = "flex";
    } catch (error) {
      this.showNotification("预览文件失败", "error");
    }
  }
  downloadFile(fileName) {
    const filePath = this.currentPath
      ? `${this.currentPath}/${fileName}`
      : fileName;
    const downloadUrl = `/api/download?path=${encodeURIComponent(filePath)}`;
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
  async uploadFiles(files) {
    if (files.length === 0) return;
    const formData = new FormData();
    formData.append("path", this.currentPath);
    for (const file of files) {
      formData.append("files", file);
    }
    try {
      this.elements.uploadProgress.style.display = "block";
      this.elements.progressText.textContent = "准备上传...";
      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          const percent = (e.loaded / e.total) * 100;
          this.elements.progressFill.style.width = `${percent}%`;
          this.elements.progressText.textContent = `上传中... ${Math.round(
            percent
          )}%`;
        }
      });
      xhr.addEventListener("load", () => {
        if (xhr.status === 200) {
          const response = JSON.parse(xhr.responseText);
          this.showNotification(response.message, "success");
          this.loadFiles(this.currentPath); // 刷新文件列表
        } else {
          throw new Error("上传失败");
        }
        this.elements.uploadProgress.style.display = "none";
        this.elements.fileInput.value = ""; // 重置文件选择
      });
      xhr.addEventListener("error", () => {
        this.showNotification("上传文件失败", "error");
        this.elements.uploadProgress.style.display = "none";
      });
      xhr.open("POST", "/api/upload");
      xhr.send(formData);
    } catch (error) {
      this.showNotification("上传文件失败", "error");
      this.elements.uploadProgress.style.display = "none";
    }
  }
  showNotification(message, type) {
    this.elements.notification.textContent = message;
    this.elements.notification.className = `notification ${type}`;
    this.elements.notification.style.display = "block";
    setTimeout(() => {
      this.elements.notification.style.display = "none";
    }, 3000);
  }
}
// 全局函数
function closePreview() {
  document.getElementById("previewModal").style.display = "none";
}
// 初始化
let fileManager;
document.addEventListener("DOMContentLoaded", () => {
  fileManager = new WebFileManager();
});
