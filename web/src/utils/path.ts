export function normalizeSharePath(path: string) {
  return (path || "")
    .split("/")
    .filter((part) => part.length > 0)
    .join("/");
}

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function encodeSharePath(path: string) {
  const normalizedPath = normalizeSharePath(path);
  if (!normalizedPath) return "";

  const encoder = new TextEncoder();
  return normalizedPath
    .split("/")
    .filter(Boolean)
    .map((part) => toBase64Url(encoder.encode(part)))
    .join("/");
}

export function decodeSharePath(path: string) {
  const normalizedPath = normalizeSharePath(path);
  if (!normalizedPath) return "";

  const decoder = new TextDecoder();
  try {
    return normalizeSharePath(
      normalizedPath
        .split("/")
        .filter(Boolean)
        .map((part) => decoder.decode(fromBase64Url(part)))
        .join("/"),
    );
  } catch {
    return normalizedPath;
  }
}

export function getPathFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return decodeSharePath(params.get("path") || "");
}

export function syncPathToUrl(
  path: string,
  options?: { replace?: boolean },
) {
  const url = new URL(window.location.href);
  const nextPath = normalizeSharePath(path);
  const encodedPath = encodeSharePath(nextPath);
  if (encodedPath) url.searchParams.set("path", encodedPath);
  else url.searchParams.delete("path");
  const method = options?.replace ? "replaceState" : "pushState";
  window.history[method](null, "", url);
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
