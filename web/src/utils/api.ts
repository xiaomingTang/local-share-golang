import type { DeleteResponse, FilesResponse } from "../types";

export async function fetchFiles(path: string) {
  const resp = await fetch(`/api/files?path=${encodeURIComponent(path || "")}`);
  const data = (await resp.json().catch(() => null)) as any;
  if (!resp.ok) {
    throw new Error(data?.error || "加载文件失败");
  }
  return data as FilesResponse;
}

export async function downloadZip(paths: string[]) {
  return downloadZipWithIgnore({ paths, ignore: [] });
}

export async function downloadZipWithIgnore(opts: {
  paths: string[];
  ignore?: string[];
}) {
  const { paths, ignore } = opts;
  const resp = await fetch("/api/download-zip", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paths, ignore: ignore || [] }),
  });

  const ct = (resp.headers.get("content-type") || "").toLowerCase();
  if (!resp.ok) {
    const msg = ct.includes("application/json")
      ? (await resp.json().catch(() => null))?.error
      : await resp.text().catch(() => "");
    throw new Error(msg || "批量下载失败");
  }

  const blob = await resp.blob();
  const cd = resp.headers.get("content-disposition") || "";
  const m = /filename\*=UTF-8''([^;]+)/i.exec(cd);
  const fileName = m ? decodeURIComponent(m[1]) : "selected.zip";
  return { blob, fileName };
}

export async function deletePaths(paths: string[]) {
  const resp = await fetch("/api/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paths }),
  });
  const payload = (await resp.json().catch(() => null)) as any;
  if (!resp.ok) {
    throw new Error(payload?.error || "批量删除失败");
  }
  return payload as DeleteResponse;
}

export async function fetchPreview(filePath: string) {
  const resp = await fetch(`/api/preview?path=${encodeURIComponent(filePath)}`);
  if (!resp.ok) throw new Error("预览失败");

  const contentType = resp.headers.get("content-type") || "";
  if ((contentType || "").toLowerCase().startsWith("image/")) {
    const blob = await resp.blob();
    return { contentType, blob, text: "" };
  }

  const text = await resp.text();
  return { contentType, blob: new Blob(), text };
}

export async function uploadFilesWithProgress(opts: {
  path: string;
  files: File[];
  onProgress?: (pct: number) => void;
}) {
  const { path, files, onProgress } = opts;

  const formData = new FormData();
  formData.append("path", path || "");
  for (const file of files) formData.append("files", file);

  await uploadFilesWithProgressXHR({ formData, onProgress });
}

function uploadFilesWithProgressXHR(opts: {
  formData: FormData;
  onProgress?: (pct: number) => void;
}) {
  const { formData, onProgress } = opts;

  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (e) => {
      if (!e.lengthComputable) return;
      const pct = (e.loaded / e.total) * 100;
      onProgress?.(Math.max(0, Math.min(100, pct)));
    });

    xhr.addEventListener("load", () => {
      let payload: any = null;
      try {
        payload = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        payload = null;
      }

      if (xhr.status === 200) {
        resolve();
      } else {
        reject(new Error(payload?.error || payload?.message || "上传失败"));
      }
    });

    xhr.addEventListener("error", () => {
      reject(new Error("上传失败"));
    });

    xhr.open("POST", "/api/upload");
    xhr.send(formData);
  });
}
