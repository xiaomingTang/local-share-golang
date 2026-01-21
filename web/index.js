import { toast } from "./notification.js";
import { buildBreadcrumbHtml } from "./breadcrumb.js";
import {
  canPreview,
  escapeHtml,
  formatFileSize,
  getFileIcon,
  getFileIconClass,
} from "./file-utils.js";
import { createPreviewer } from "./preview.js";
import { createUploader } from "./upload.js";

class WebFileManager {
  constructor() {
    this.currentPath = "";
    this.rootName = "根目录";
    this.elements = {
      fileList: document.getElementById("fileList"),
      uploadTarget: document.getElementById("uploadTarget"),
    };

    this.previewer = createPreviewer({
      toast,
      escapeHtml,
      onDownload: (fileName) => this.downloadFile(fileName),
    });
    this.previewer.bind();

    this.uploader = createUploader({
      toast,
      getCurrentPath: () => this.currentPath,
      onUploaded: () => this.loadFiles(this.currentPath),
    });
    this.uploader.bind();

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
  // 上传/预览事件已迁移到 upload.js / preview.js
  async loadFiles(path = "") {
    try {
      this.elements.fileList.innerHTML =
        '<div class="file-item loading">加载中...</div>';
      const response = await fetch(
        `/api/files?path=${encodeURIComponent(path)}`,
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
              this.rootName,
            )}</div>
          </div>
        </div>
        <div class="file-item error-state">${escapeHtml(message)}</div>
      `;
      toast.error(message);
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
                this.rootName,
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
                      item,
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
    const filePath = this.currentPath
      ? `${this.currentPath}/${fileName}`
      : fileName;
    return this.previewer.open({ fileName, filePath });
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
}
// 全局函数
window.closePreview = function closePreview() {
  fileManager?.previewer?.close?.();
};
// 初始化
let fileManager;
document.addEventListener("DOMContentLoaded", () => {
  fileManager = new WebFileManager();
  window.fileManager = fileManager;
});
