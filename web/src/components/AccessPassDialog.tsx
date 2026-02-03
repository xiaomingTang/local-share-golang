import {
  Box,
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
import { TextButton } from "./TextButton";

import { SubmitEvent, useMemo, useState } from "react";
import { cat } from "@common/error/catch-and-toast";

function validatePass(input: string): { ok: boolean; helperText: string } {
  const trimmed = (input || "").trim();
  if (!trimmed) return { ok: false, helperText: "请输入访问口令" };
  if (!/^[0-9A-Za-z]{1,16}$/.test(trimmed)) {
    return { ok: false, helperText: "要求为 1-16 位数字/大小写字母" };
  }
  return { ok: true, helperText: "\u00A0" };
}

export type AccessPassDialogProps = {
  onSave?: (pass: string) => Promise<void>;
};

export const AccessPassDialog = NiceModal.create(
  (props: AccessPassDialogProps) => {
    const modal = useModal();
    const [text, setText] = useState("");

    const v = useMemo(() => validatePass(text), [text]);

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
        <DialogTitle>请输入访问口令后继续</DialogTitle>
        <DialogContent>
          <Box
            sx={{ pt: 1 }}
            component="form"
            onSubmit={cat(async (e: SubmitEvent) => {
              e.preventDefault();
              const pass = text.trim();
              if (!/^[0-9A-Za-z]{1,16}$/.test(pass)) return;
              await props.onSave?.(pass);
              modal.resolve(pass);
              void modal.hide();
            })}
          >
            <TextField
              autoFocus
              size="small"
              fullWidth
              label="访问口令"
              placeholder="如：a8"
              value={text}
              onChange={(e) => setText(e.target.value)}
              error={!!text && !v.ok}
              helperText={v.ok ? "\u00A0" : v.helperText}
              slotProps={{
                input: {
                  autoComplete: "off",
                  endAdornment: (
                    <TextButton
                      type="submit"
                      disabled={!text}
                      sx={{ fontSize: 14 }}
                    >
                      确定
                    </TextButton>
                  ),
                },
              }}
            />
          </Box>
        </DialogContent>
      </Dialog>
    );
  },
);
