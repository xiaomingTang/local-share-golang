import { Paper, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { BreadcrumbNav } from "./BreadcrumbNav";
import { buildCrumbs } from "src/utils/path";
import {
  DownloadFileIcon,
  FileActionIconButton,
} from "./FileActionIconButton";

type FilePageFrameProps = {
  rootName: string;
  currentPath: string;
  title: string;
  subtitle: string;
  onNavigate: (path: string) => void;
  onDownload: () => void;
  children: ReactNode;
};

export function FilePageFrame(props: FilePageFrameProps) {
  const {
    rootName,
    currentPath,
    title,
    subtitle,
    onNavigate,
    onDownload,
    children,
  } = props;

  const crumbs = buildCrumbs(currentPath, rootName);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <Paper
        className="overflow-hidden"
        elevation={0}
        sx={{
          borderRadius: 2,
          backgroundColor: "rgba(255, 255, 255, 0.06)",
        }}
      >
        <BreadcrumbNav crumbs={crumbs} onNavigate={onNavigate} />
        <div className="border-b border-white/10 px-4 py-4 md:px-6">
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={2}
            justifyContent="space-between"
            alignItems={{ xs: "flex-start", md: "center" }}
          >
            <div className="min-w-0">
              <Typography variant="h5" sx={{ wordBreak: "break-all" }}>
                {title}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {subtitle}
              </Typography>
            </div>
            <FileActionIconButton
              label="下载"
              icon={<DownloadFileIcon />}
              tone="filled"
              onClick={onDownload}
            />
          </Stack>
        </div>
        <div className="p-4 md:p-6">{children}</div>
      </Paper>
    </div>
  );
}