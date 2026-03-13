import { Alert, Typography } from "@mui/material";
import type { DirectoryItem } from "src/types";
import { formatFileSize, getPreviewReasonText } from "src/utils/fileUtils";
import { FilePageFrame } from "./FilePageFrame";

type UnsupportedFilePageProps = {
  rootName: string;
  currentPath: string;
  item: DirectoryItem;
  onNavigate: (path: string) => void;
  onDownload: () => void;
};

export function UnsupportedFilePage(props: UnsupportedFilePageProps) {
  const { rootName, currentPath, item, onNavigate, onDownload } = props;
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
      <Alert severity="info" sx={{ mb: 2 }}>
        {getPreviewReasonText(item)}
      </Alert>
      <Typography variant="body2" color="text.secondary">
        当前文件已经作为独立页面打开，但本版本不提供在线预览。你仍然可以直接下载，或者使用浏览器返回回到目录页。
      </Typography>
    </FilePageFrame>
  );
}