export function getPathFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("path") || "";
}

export function syncPathToUrl(path: string) {
  const url = new URL(window.location.href);
  if (path) url.searchParams.set("path", path);
  else url.searchParams.delete("path");
  window.history.replaceState(null, "", url);
}

export function buildCrumbs(currentPath: string, rootLabel: string) {
  const parts = currentPath ? currentPath.split("/").filter(Boolean) : [];
  const crumbs: Array<{ label: string; path: string }> = [
    { label: rootLabel || "根目录", path: "" },
  ];
  let acc = "";
  for (const part of parts) {
    acc = acc ? `${acc}/${part}` : part;
    crumbs.push({ label: part, path: acc });
  }
  return crumbs;
}
