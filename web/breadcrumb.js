import { escapeHtml } from "./file-utils.js";

export function buildBreadcrumbHtml(currentPath, rootLabel) {
  const parts = currentPath ? currentPath.split("/").filter(Boolean) : [];
  const crumbs = [{ label: rootLabel || "根目录", path: "" }];
  let acc = "";
  for (const part of parts) {
    acc = acc ? `${acc}/${part}` : part;
    crumbs.push({ label: part, path: acc });
  }
  const html = crumbs
    .map((c, idx) => {
      const isLast = idx === crumbs.length - 1;
      const label = escapeHtml(c.label);
      const onClick = `fileManager.loadFiles(${JSON.stringify(c.path)})`;
      // 当前目录不需要跳转
      if (isLast) {
        return `<span class="breadcrumb-seg current">${label}</span>`;
      }
      return `<span class="breadcrumb-seg" onclick='${onClick}'>${label}</span>`;
    })
    .join('<span class="breadcrumb-sep">/</span>');
  return `<div class="breadcrumb-nav">${html}</div>`;
}
