import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
} from "@mui/material";

export type PreviewDialogProps = {
  open: boolean;
  title: string;
  isLoading: boolean;
  imageUrl: string | null;
  text: string;
  onClose: () => void;
  onDownload: () => void;
};

export function PreviewDialog(props: PreviewDialogProps) {
  const { open, title, isLoading, imageUrl, text, onClose, onDownload } = props;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            backgroundColor: "rgba(17, 17, 17, 0.8)",
            backdropFilter: "blur(10px)",
          },
        },
      }}
    >
      <DialogTitle>{title}</DialogTitle>
      <DialogContent dividers>
        {isLoading && (
          <div className="py-10">
            <LinearProgress />
          </div>
        )}
        {!isLoading && imageUrl && (
          <img
            src={imageUrl}
            alt={title}
            className="mx-auto max-h-[70vh] max-w-full rounded-lg"
          />
        )}
        {!isLoading && !imageUrl && (
          <textarea
            disabled
            readOnly
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
        <Button onClick={onClose} variant="outlined">
          关闭
        </Button>
        <Button onClick={onDownload} variant="contained">
          下载
        </Button>
      </DialogActions>
    </Dialog>
  );
}
