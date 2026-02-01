import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from "@mui/material";

import NiceModal, { useModal } from "@ebay/nice-modal-react";

import { muiDialogV5ReplaceOnClose } from "@common/utils/muiDialogV5ReplaceOnClose";
import { SilentError } from "@common/error/silent-error";

import { useMemo, useState } from "react";

function validatePass(input: string): { ok: boolean; helperText: string } {
  const trimmed = (input || "").trim();
  if (!trimmed) return { ok: false, helperText: "请输入访问口令" };
  if (!/^[0-9A-Za-z]{1,16}$/.test(trimmed)) {
    return { ok: false, helperText: "要求为 1-16 位数字/大小写字母" };
  }
  return { ok: true, helperText: "\u00A0" };
}

export type AccessPassDialogProps = {
  title?: string;
  description?: string;
};

export const AccessPassDialog = NiceModal.create(
  (props: AccessPassDialogProps) => {
    const modal = useModal();
    const [text, setText] = useState("");

    const v = useMemo(() => validatePass(text), [text]);
    const disabled = !v.ok;

    return (
      <Dialog
        {...muiDialogV5ReplaceOnClose(modal)}
        maxWidth="xs"
        fullWidth
        slotProps={{
          paper: {
            sx: {
              backgroundColor: "#01132d",
            },
          },
        }}
      >
        <DialogTitle>{props.title || "访问口令"}</DialogTitle>
        <DialogContent>
          <Typography
            sx={{ pt: 0.5, pb: 1 }}
            variant="body2"
            color="text.secondary"
          >
            {props.description ||
              "该共享已启用访问口令。请输入口令后继续。口令不会被保存。"}
          </Typography>
          <TextField
            autoFocus
            size="small"
            fullWidth
            label="访问口令"
            placeholder="如：a8"
            value={text}
            onChange={(e) => setText(e.target.value)}
            error={Boolean(text) && !v.ok}
            helperText={v.ok ? "\u00A0" : v.helperText}
            slotProps={{
              input: {
                autoComplete: "off",
              },
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              modal.reject(new SilentError("操作已取消"));
              void modal.hide();
            }}
            variant="outlined"
          >
            取消
          </Button>
          <Button
            variant="contained"
            disabled={disabled}
            onClick={() => {
              const pass = text.trim();
              if (!/^[0-9A-Za-z]{1,16}$/.test(pass)) return;
              modal.resolve(pass);
              void modal.hide();
            }}
          >
            确定
          </Button>
        </DialogActions>
      </Dialog>
    );
  },
);
