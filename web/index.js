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

    this.selectedPaths = new Set();
    this.lastItems = [];

    this.elements = {
      fileList: document.getElementById("fileList"),
      uploadTarget: document.getElementById("uploadTarget"),
      selectionBar: document.getElementById("selectionBar"),
      selectAllCheckbox: document.getElementById("selectAllCheckbox"),
      selectionCount: document.getElementById("selectionCount"),
      btnBatchDownload: document.getElementById("btnBatchDownload"),
      btnBatchDelete: document.getElementById("btnBatchDelete"),
      btnClearSelection: document.getElementById("btnClearSelection"),
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

    this.bindSelectionActions();
    this.updateSelectionBar();

    this.loadFiles(initialPath);
  }

  bindSelectionActions() {
    const els = this.elements;
    if (els.selectAllCheckbox) {
      els.selectAllCheckbox.addEventListener("change", (e) => {
        const checked = !!e.target.checked;
        this.setSelectAll(checked);
      });
    }
    els.btnBatchDownload?.addEventListener("click", () => {
      void this.downloadSelected();
    });
    els.btnBatchDelete?.addEventListener("click", () => {
      void this.deleteSelected();
    });
    els.btnClearSelection?.addEventListener("click", () => {
      this.clearSelection();
    });
  }

  buildFilePath(fileName) {
    return this.currentPath ? `${this.currentPath}/${fileName}` : fileName;
  }

  clearSelection() {
    this.selectedPaths.clear();
    this.updateSelectionBar();
    // 同步 UI（无需强制 reload）
    this.elements.fileList
      ?.querySelectorAll?.(".file-item.is-selected")
      ?.forEach?.((el) => el.classList.remove("is-selected"));
    this.elements.fileList
      ?.querySelectorAll?.("input.select-checkbox")
      ?.forEach?.((el) => {
        el.checked = false;
      });
  }

  updateSelectionBar() {
    const count = this.selectedPaths.size;
    if (this.elements.selectionBar) {
      this.elements.selectionBar.classList.toggle("is-sticky", count > 0);
    }
    if (this.elements.selectionCount) {
      this.elements.selectionCount.textContent = `已选 ${count} 项`;
    }

    const hasSelection = count > 0;
    if (this.elements.btnBatchDownload)
      this.elements.btnBatchDownload.disabled = !hasSelection;
    if (this.elements.btnBatchDelete)
      this.elements.btnBatchDelete.disabled = !hasSelection;
    if (this.elements.btnClearSelection)
      this.elements.btnClearSelection.disabled = !hasSelection;

    // Select-all 状态：仅基于当前目录下文件
    const currentFiles = (this.lastItems || []).filter(
      (it) => it.type === "file",
    );
    const total = currentFiles.length;
    const selectedInThisFolder = currentFiles.filter((it) =>
      this.selectedPaths.has(this.buildFilePath(it.name)),
    ).length;
    if (this.elements.selectAllCheckbox) {
      if (total === 0) {
        this.elements.selectAllCheckbox.checked = false;
        this.elements.selectAllCheckbox.indeterminate = false;
        this.elements.selectAllCheckbox.disabled = true;
      } else {
        this.elements.selectAllCheckbox.disabled = false;
        this.elements.selectAllCheckbox.checked =
          selectedInThisFolder > 0 && selectedInThisFolder === total;
        this.elements.selectAllCheckbox.indeterminate =
          selectedInThisFolder > 0 && selectedInThisFolder < total;
      }
    }
  }

  toggleSelect(fileName, checked, checkboxEl) {
    const relPath = this.buildFilePath(fileName);
    if (checked) {
      this.selectedPaths.add(relPath);
    } else {
      this.selectedPaths.delete(relPath);
    }

    const row = checkboxEl?.closest?.(".file-item");
    if (row) row.classList.toggle("is-selected", checked);
    this.updateSelectionBar();
  }

  setSelectAll(checked) {
    const files = (this.lastItems || []).filter((it) => it.type === "file");
    for (const it of files) {
      const relPath = this.buildFilePath(it.name);
      if (checked) this.selectedPaths.add(relPath);
      else this.selectedPaths.delete(relPath);
    }

    // 同步当前列表中的 checkbox
    this.elements.fileList
      ?.querySelectorAll?.(".file-item")
      ?.forEach?.((row) => {
        const cb = row.querySelector?.("input.select-checkbox");
        if (!cb) return;
        cb.checked = checked;
        row.classList.toggle("is-selected", checked);
      });
    this.updateSelectionBar();
  }

  async downloadSelected() {
    const paths = Array.from(this.selectedPaths);
    if (paths.length === 0) return;

    // 单个文件：直接下载原文件，不打包 zip
    if (paths.length === 1) {
      const relPath = paths[0];
      const fileName =
        (relPath || "").split("/").filter(Boolean).pop() || "download";
      const downloadUrl = `/api/download?path=${encodeURIComponent(relPath)}`;
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    try {
      const resp = await fetch("/api/download-zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths }),
      });

      const ct = (resp.headers.get("content-type") || "").toLowerCase();
      if (!resp.ok) {
        const msg = ct.includes("application/json")
          ? (await resp.json())?.error
          : await resp.text();
        throw new Error(msg || "批量下载失败");
      }

      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);

      // 尝试从 Content-Disposition 取文件名
      const cd = resp.headers.get("content-disposition") || "";
      const m = /filename\*=UTF-8''([^;]+)/i.exec(cd);
      const fileName = m ? decodeURIComponent(m[1]) : "selected.zip";

      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "批量下载失败";
      toast.error(msg);
    }
  }

  async deleteSelected() {
    const paths = Array.from(this.selectedPaths);
    if (paths.length === 0) return;

    if (
      !window.confirm(`确认删除已选 ${paths.length} 个文件？此操作不可撤销。`)
    ) {
      return;
    }

    try {
      const resp = await fetch("/api/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths }),
      });
      const payload = await resp.json().catch(() => null);
      if (!resp.ok) {
        throw new Error(payload?.error || "批量删除失败");
      }

      const deleted = payload?.deleted ?? 0;
      const requested = payload?.requested ?? paths.length;
      const errCount = payload?.errors ? Object.keys(payload.errors).length : 0;
      if (errCount > 0) {
        toast.error(
          `删除完成：成功 ${deleted} / ${requested}，失败 ${errCount}`,
        );
      } else {
        toast.success(`已删除 ${deleted} 个文件`);
      }

      this.clearSelection();
      await this.loadFiles(this.currentPath);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "批量删除失败";
      toast.error(msg);
    }
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

      // 切换目录时清空选择，避免跨目录误操作
      this.selectedPaths.clear();
      this.lastItems = Array.isArray(data.items) ? data.items : [];

      this.syncPathToUrl(this.currentPath);
      this.updateUploadTarget();
      this.updateSelectionBar();
      this.renderFileList(data);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "加载文件列表失败";
      // 即使路径无效，也要把它写回 URL，刷新后仍能复现并提示
      this.currentPath = path;
      this.syncPathToUrl(this.currentPath);
      this.updateUploadTarget();

      this.selectedPaths.clear();
      this.lastItems = [];
      this.updateSelectionBar();

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

    this.lastItems = Array.isArray(items) ? items : [];
    this.updateSelectionBar();

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

      const isSelected =
        item.type === "file" &&
        this.selectedPaths.has(this.buildFilePath(item.name));

      const itemClass = item.hidden ? "file-item is-hidden" : "file-item";
      const dblClickHandler = isDir
        ? `ondblclick='if(event.target.closest("button")) return; fileManager.openFolder(${nameJs})'`
        : previewable
          ? `ondblclick='if(event.target.closest("button")) return; fileManager.previewFile(${nameJs})'`
          : "";
      html += `
                <div class="${itemClass}${isSelected ? " is-selected" : ""}" ${dblClickHandler}>
                    ${
                      item.type === "file"
                        ? `<div class="file-select"><input class="select-checkbox" type="checkbox" ${
                            isSelected ? "checked" : ""
                          } onclick='event.stopPropagation(); fileManager.toggleSelect(${nameJs}, this.checked, this)' /></div>`
                        : `<div class="file-select" aria-hidden="true"></div>`
                    }
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
    this.clearSelection();
    const newPath = this.currentPath
      ? `${this.currentPath}/${folderName}`
      : folderName;
    this.loadFiles(newPath);
  }
  async previewFile(fileName) {
    const filePath = this.buildFilePath(fileName);
    return this.previewer.open({ fileName, filePath });
  }
  downloadFile(fileName) {
    const filePath = this.buildFilePath(fileName);
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
