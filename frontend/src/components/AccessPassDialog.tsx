import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from "@mui/material";

import NiceModal, { useModal } from "@ebay/nice-modal-react";

import { muiDialogV5ReplaceOnClose } from "@common/utils/muiDialogV5ReplaceOnClose";
import { useThrottlingState } from "@common/utils/useThrottle";

import { useMemo } from "react";
import { autoFocus } from "@common/utils/autoFocus";

function parseAccessPassInputText(input: string): {
  value: string;
  error: string | null;
} {
  const trimmed = (input || "").trim();
  if (!trimmed) return { value: "", error: null };
  if (!/^[0-9A-Za-z]{1,16}$/.test(trimmed)) {
    return {
      value: trimmed,
      error: "1-16 位数字/大小写字母，留空 表示不启用",
    };
  }
  return { value: trimmed, error: null };
}

export interface AccessPassDialogProps {
  value: string;
  onSave?: (value: string) => void;
}

export const AccessPassDialog = NiceModal.create(
  (props: AccessPassDialogProps) => {
    const modal = useModal();

    const [text, setText] = useThrottlingState(props.value ?? "", (v) => {
      if (!parseAccessPassInputText(v).error) {
        props.onSave?.(v);
      }
    });
    const parsed = useMemo(() => parseAccessPassInputText(text), [text]);

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
        <DialogTitle>访问口令</DialogTitle>
        <DialogContent>
          <Box
            component="form"
            sx={{ width: "100%", pt: 2 }}
            onSubmit={(e) => {
              e.preventDefault();
              if (parsed.error) return;
              modal.resolve(parsed.value);
              void modal.hide();
            }}
          >
            <TextField
              inputRef={autoFocus}
              size="small"
              fullWidth
              label="访问口令"
              value={text}
              onChange={(e) => setText(e.target.value)}
              error={!!parsed.error}
              helperText={
                parsed.error ?? "1-16 位数字/大小写字母，留空 表示不启用"
              }
              slotProps={{
                input: {
                  autoComplete: "off",
                },
              }}
            />
          </Box>
        </DialogContent>
      </Dialog>
    );
  },
);
