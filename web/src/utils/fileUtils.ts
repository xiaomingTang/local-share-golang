import type { DirectoryItem } from "src/types";

export function formatFileSize(bytes: number) {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"] as const;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function isImageType(contentType: string) {
  return (contentType || "").toLowerCase().startsWith("image/");
}

export function isPreviewSupported(item: DirectoryItem) {
  return item.type === "file" && item.preview?.supported === true;
}

export function getPreviewReasonText(item: DirectoryItem) {
  const reason = item.preview?.reason || "";
  if (reason === "file_too_large") {
    return "文件过大，暂不支持在线预览";
  }
  return "不支持的文件类型";
}

export function getFileIcon(item: DirectoryItem) {
  if (item.type === "directory") return "📁";
  const ext = item.extension || "";
  const iconMap: Record<string, string> = {
    ".ico": "🖼️",
    ".jpg": "🖼️",
    ".jpeg": "🖼️",
    ".png": "🖼️",
    ".gif": "🖼️",
    ".bmp": "🖼️",
    ".svg": "🖼️",
    ".mp4": "▶️",
    ".avi": "▶️",
    ".mkv": "▶️",
    ".mov": "▶️",
    ".wmv": "▶️",
    ".flv": "▶️",
    ".mp3": "🎵",
    ".wav": "🎵",
    ".flac": "🎵",
    ".aac": "🎵",
    ".ogg": "🎵",
    ".pdf": "📄",
    ".doc": "📝",
    ".docx": "📝",
    ".txt": "📝",
    ".rtf": "📝",
    ".xls": "📊",
    ".xlsx": "📊",
    ".ppt": "📽️",
    ".pptx": "📽️",
    ".zip": "📦",
    ".rar": "📦",
    ".7z": "📦",
    ".tar": "📦",
    ".gz": "📦",
    ".js": "🧩",
    ".ts": "🧩",
    ".json": "🧩",
    ".xml": "🧩",
    ".yml": "🧩",
    ".yaml": "🧩",
    ".html": "🧩",
    ".css": "🧩",
    ".py": "🧩",
    ".java": "🧩",
    ".cpp": "🧩",
    ".hpp": "🧩",
    ".c": "🧩",
    ".h": "🧩",
    ".php": "🧩",
    ".rb": "🧩",
    ".go": "🧩",
    ".rs": "🧩",
    ".cs": "🧩",
    ".kt": "🧩",
    ".swift": "🧩",
    ".sh": "🧩",
    ".bat": "🧩",
    ".ps1": "🧩",
    ".sql": "🧩",
    ".toml": "⚙️",
    ".ini": "⚙️",
    ".env": "⚙️",
  };
  return iconMap[ext] || (isPreviewSupported(item) ? "📄" : "❔");
}

export function download(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
