import { useMemo, useState } from "react";
import useSWR from "swr";
import { fetchPreview } from "src/utils/api";
import { isImageType } from "src/utils/fileUtils";
import { useObjectURL } from "./useObjectURL";

type PreviewState =
  | { open: false }
  | {
      open: true;
      fileName: string;
      filePath: string;
    };

export function useFilePreview(params: {
  currentPath: string;
  buildFilePath: (currentPath: string, fileName: string) => string;
}) {
  const { currentPath, buildFilePath } = params;
  const [preview, setPreview] = useState<PreviewState>({ open: false });

  const {
    data: previewData,
    error: previewError,
    isValidating: previewIsValidating,
  } = useSWR(
    preview.open ? ["preview", preview.filePath] : null,
    async ([, filePath]) => fetchPreview(filePath),
  );

  const previewObjectUrl = useObjectURL(
    preview.open && isImageType(previewData?.contentType ?? "")
      ? (previewData?.blob ?? null)
      : null,
  );

  function openPreview(fileName: string) {
    const filePath = buildFilePath(currentPath, fileName);
    setPreview({ open: true, fileName, filePath });
  }

  function closePreview() {
    setPreview({ open: false });
  }

  const title = preview.open ? preview.fileName : "文件预览";

  const text = useMemo(() => {
    if (!preview.open) return "";
    if (previewObjectUrl) return "";
    return previewData?.text || "";
  }, [preview.open, previewObjectUrl, previewData?.text]);

  return {
    preview,
    openPreview,
    closePreview,
    title,
    previewData,
    previewError,
    previewIsValidating,
    previewObjectUrl,
    text,
  };
}
