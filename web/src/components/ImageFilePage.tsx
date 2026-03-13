import { Alert, LinearProgress } from "@mui/material";
import useSWR from "swr";
import type { DirectoryItem } from "src/types";
import { useObjectURL } from "src/hooks/useObjectURL";
import { fetchPreview } from "src/utils/api";
import { formatFileSize } from "src/utils/fileUtils";
import { FilePageFrame } from "./FilePageFrame";

type ImageFilePageProps = {
  rootName: string;
  currentPath: string;
  item: DirectoryItem;
  onNavigate: (path: string) => void;
  onDownload: () => void;
};

export function ImageFilePage(props: ImageFilePageProps) {
  const {
    rootName,
    currentPath,
    item,
    onNavigate,
    onDownload,
  } = props;

  const { data, error, isValidating } = useSWR(["preview", currentPath],
    async ([, filePath]) => fetchPreview(filePath),
  );
  const imageUrl = useObjectURL(data?.blob ?? null);

  const subtitle = `${formatFileSize(item.size)}  ·  ${new Date(item.modified).toLocaleString()}`;

  return (
    <FilePageFrame
      rootName={rootName}
      currentPath={currentPath}
      title={item.name}
      subtitle={subtitle}
      onNavigate={onNavigate}
      onDownload={onDownload}
    >
      {isValidating && (
        <div className="py-8">
          <LinearProgress />
        </div>
      )}
      {!isValidating && error instanceof Error && (
        <Alert severity="error">{error.message}</Alert>
      )}
      {!isValidating && !error && imageUrl && (
        <img
          src={imageUrl}
          alt={item.name}
          className="mx-auto max-h-[72vh] max-w-full rounded-md"
        />
      )}
    </FilePageFrame>
  );
}