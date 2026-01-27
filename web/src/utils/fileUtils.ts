import type { DirectoryItem } from "../types";

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

export function canPreview(item: DirectoryItem) {
  if (item.type === "directory") return false;
  const ext = item.extension || "";
  const previewableExts = new Set([
    ".ico",
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".bmp",
    ".svg",
    ".txt",
    ".md",
    ".json",
    ".html",
    ".css",
    ".js",
    ".ts",
    ".go",
    ".py",
    ".java",
    ".c",
    ".h",
    ".cpp",
    ".hpp",
    ".rs",
    ".php",
    ".rb",
    ".cs",
    ".kt",
    ".swift",
    ".sh",
    ".bat",
    ".ps1",
    ".sql",
    ".toml",
    ".ini",
    ".env",
    ".xml",
    ".yml",
    ".yaml",
    ".csv",
    ".log",
  ]);
  return previewableExts.has(ext) && item.size < 10 * 1024 * 1024;
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
  return iconMap[ext] || (canPreview(item) ? "📄" : "❔");
}

export function download(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
