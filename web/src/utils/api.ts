import { getWebToken } from "@common/storage/web-token";

import type { DeleteResponse, FilesResponse } from "../types";
import { ensureShareToken } from "./auth";
import { http } from "./http";

export async function fetchFiles(path: string) {
  return http
    .get("/api/files", {
      searchParams: { path: path || "" },
    })
    .json<FilesResponse>();
}

export async function downloadZip(paths: string[]) {
  return downloadZipWithIgnore({ paths, ignore: [] });
}

export async function downloadZipWithIgnore(opts: {
  paths: string[];
  ignore?: string[];
}) {
  const { paths, ignore } = opts;
  const resp = await http.post("/api/download-zip", {
    json: { paths, ignore: ignore || [] },
  });

  const blob = await resp.blob();
  const cd = resp.headers.get("content-disposition") || "";
  const m = /filename\*=UTF-8''([^;]+)/i.exec(cd);
  const fileName = m ? decodeURIComponent(m[1]) : "selected.zip";
  return { blob, fileName };
}

export async function deletePaths(paths: string[]) {
  return http
    .post("/api/delete", {
      json: { paths },
    })
    .json<DeleteResponse>();
}

export async function fetchPreview(filePath: string) {
  const resp = await http.get("/api/preview", {
    searchParams: { path: filePath },
  });

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

  try {
    await uploadFilesWithProgressXHR({ formData, onProgress });
  } catch (e: any) {
    if (e?.status === 401) {
      await ensureShareToken();
      await uploadFilesWithProgressXHR({ formData, onProgress });
      return;
    }
    throw e;
  }
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
        const err = new Error(
          payload?.error || payload?.message || "上传失败",
        ) as Error & { status?: number; code?: string };
        err.status = xhr.status;
        err.code = payload?.code;
        reject(err);
      }
    });

    xhr.addEventListener("error", () => {
      reject(new Error("上传失败"));
    });

    xhr.open("POST", "/api/upload");
    // XHR path keeps manual token injection (upload progress).
    // Token is intentionally stored as a header to avoid leaking into URLs.
    const token = getWebToken();
    if (token) {
      try {
        xhr.setRequestHeader("X-Share-Token", token);
      } catch {}
    }
    xhr.send(formData);
  });
}
