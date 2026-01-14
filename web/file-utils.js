"use strict";
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
function formatFileSize(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}
function canPreview(item) {
  if (item.type === "directory") return false;
  const ext = item.extension || "";
  const previewableExts = [
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
  ];
  return previewableExts.includes(ext) && item.size < 10 * 1024 * 1024;
}
function getFileIcon(item) {
  if (item.type === "directory") return "📁";
  const ext = item.extension || "";
  const iconMap = {
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
  return iconMap[ext] || "📄";
}
function getFileIconClass(item) {
  if (item.type === "directory") return "folder";
  const ext = item.extension || "";
  if ([".ico", ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".svg"].includes(ext))
    return "image";
  if ([".mp4", ".avi", ".mkv", ".mov", ".wmv", ".flv"].includes(ext))
    return "video";
  if ([".mp3", ".wav", ".flac", ".aac", ".ogg"].includes(ext)) return "audio";
  if (
    [
      ".pdf",
      ".doc",
      ".docx",
      ".txt",
      ".rtf",
      ".xls",
      ".xlsx",
      ".ppt",
      ".pptx",
    ].includes(ext)
  )
    return "document";
  if ([".zip", ".rar", ".7z", ".tar", ".gz"].includes(ext)) return "archive";
  if (
    [
      ".js",
      ".ts",
      ".html",
      ".css",
      ".py",
      ".java",
      ".cpp",
      ".hpp",
      ".c",
      ".h",
      ".php",
      ".rb",
      ".go",
      ".rs",
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
    ].includes(ext)
  )
    return "code";
  return "default";
}
