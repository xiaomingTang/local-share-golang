import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
} from "@mui/material";

import NiceModal, { useModal } from "@ebay/nice-modal-react";
import useSWR from "swr";

import { muiDialogV5ReplaceOnClose } from "@common/utils/muiDialogV5ReplaceOnClose";
import { SilentError } from "@common/error/silent-error";

import { fetchPreview } from "../utils/api";
import { isImageType } from "../utils/fileUtils";
import { useObjectURL } from "../hooks/useObjectURL";

export type PreviewDialogProps = {
  title: string;
  filePath: string;
  onDownload: () => void;
};

export const PreviewDialog = NiceModal.create((props: PreviewDialogProps) => {
  const modal = useModal();
  const { title, filePath, onDownload } = props;

  const {
    data: previewData,
    error: previewError,
    isValidating: previewIsValidating,
  } = useSWR(["preview", filePath], async ([, fp]) => fetchPreview(fp));

  const imageUrl = useObjectURL(
    isImageType(previewData?.contentType ?? "")
      ? (previewData?.blob ?? null)
      : null,
  );

  const text = imageUrl
    ? ""
    : previewError instanceof Error
      ? previewError.message
      : (previewData?.text ?? "");

  return (
    <Dialog
      {...muiDialogV5ReplaceOnClose(modal)}
      maxWidth="md"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            backgroundColor: "#01132d",
          },
        },
      }}
    >
      <DialogTitle sx={{ wordBreak: "break-all" }}>{title}</DialogTitle>
      <DialogContent dividers>
        {previewIsValidating && (
          <div className="py-10">
            <LinearProgress />
          </div>
        )}
        {!previewIsValidating && imageUrl && (
          <img
            src={imageUrl}
            alt={title}
            className="mx-auto max-h-[70vh] max-w-full rounded-lg"
          />
        )}
        {!previewIsValidating && !imageUrl && (
          <textarea
            readOnly
            autoFocus
            className="h-[60vh] block w-full overflow-auto whitespace-pre rounded-lg bg-black/30 p-4 text-sm font-mono leading-normal outline-0 resize-none"
            style={{
              tabSize: 2,
            }}
          >
            {text}
          </textarea>
        )}
      </DialogContent>
      <DialogActions>
        <Button
          onClick={() => {
            modal.reject(new SilentError("操作已取消"));
            void modal.hide();
          }}
          variant="outlined"
        >
          关闭
        </Button>
        <Button onClick={onDownload} variant="contained">
          下载
        </Button>
      </DialogActions>
    </Dialog>
  );
});
