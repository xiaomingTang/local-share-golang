import {
  Button,
  ButtonBase,
  LinearProgress,
  Paper,
  Typography,
} from "@mui/material";
import clsx from "clsx";
import { useRef } from "react";

export type UploadPanelProps = {
  targetLabel: string;
  uploading: boolean;
  uploadPct: number;
  onUpload: (files: FileList | File[]) => void | Promise<void>;
};

export function UploadPanel(props: UploadPanelProps) {
  const { targetLabel, uploading, uploadPct, onUpload } = props;
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <Paper
      className="px-4 py-4"
      elevation={0}
      sx={{ borderRadius: 2, backgroundColor: "rgba(255, 255, 255, 0.06)" }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          文件上传
        </Typography>
        <Typography variant="body2" className="opacity-80">
          上传到：{targetLabel}
        </Typography>
      </div>

      <ButtonBase
        disabled={uploading}
        focusRipple
        onClick={() => fileInputRef.current?.click()}
        sx={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          px: 6,
          py: 10,
          textAlign: "center",
          transition: "border-color 0.3s, background-color 0.3s",
          borderRadius: 3,
          border: "2px dashed rgba(255, 255, 255, 0.2)",
          backgroundColor: "rgba(255, 255, 255, 0.03)",
          cursor: uploading ? "default" : "pointer",
          opacity: uploading ? 0.7 : 1,
          ["&:hover"]: {
            borderColor: uploading
              ? "rgba(255, 255, 255, 0.2)"
              : "rgba(255, 255, 255, 0.4)",
          },
        }}
        onDragOver={(e) => {
          e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          void onUpload(e.dataTransfer.files);
        }}
      >
        <div className="mx-auto mb-4 text-4xl opacity-70">📤</div>
        <div className="text-sm opacity-80">拖拽文件到此处或点击选择</div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = e.target.files;
            if (files) void onUpload(files);
            e.currentTarget.value = "";
          }}
        />
      </ButtonBase>

      {uploading && (
        <div className="mt-4">
          <Typography variant="body2" className="mb-2 opacity-80">
            上传中... {Math.round(uploadPct)}%
          </Typography>
          <LinearProgress variant="determinate" value={uploadPct} />
        </div>
      )}
    </Paper>
  );
}
