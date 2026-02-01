import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  InputAdornment,
  TextField,
  Typography,
} from "@mui/material";

import NiceModal, { useModal } from "@ebay/nice-modal-react";

import { muiDialogV5ReplaceOnClose } from "@common/utils/muiDialogV5ReplaceOnClose";
import { useThrottle } from "@common/utils/useThrottle";
import { useMountedRef } from "@common/utils/useMounted";

import { useEffect, useMemo, useState } from "react";
import { TextButton } from "./TextButton";

function parseAccessPassInputText(input: string): {
  value: string;
  error: string | null;
} {
  const trimmed = (input || "").trim();
  if (!trimmed) return { value: "", error: null };
  if (!/^[0-9A-Za-z]{1,16}$/.test(trimmed)) {
    return {
      value: trimmed,
      error: "要求为 1-16 位数字/大小写字母，或留空禁用",
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

    const [text, setText] = useState(props.value ?? "");
    const parsed = useMemo(() => parseAccessPassInputText(text), [text]);

    const throttledOnSave = useThrottle((v: string) => props.onSave?.(v), 400, {
      leading: true,
      trailing: true,
    });

    const didMountRef = useMountedRef();
    useEffect(() => {
      if (!didMountRef.current) return;
      if (!parseAccessPassInputText(text).error) {
        throttledOnSave(text);
      }
    }, [didMountRef, text, throttledOnSave]);

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
          <Typography sx={{ pt: 0.5, pb: 1 }} color="text.secondary">
            输入 1-16 位数字/大小写字母组合；留空表示不启用访问口令。
          </Typography>
          <Box sx={{ width: "100%" }}>
            <TextField
              size="small"
              fullWidth
              label="访问口令"
              placeholder="留空表示不启用"
              value={text}
              onChange={(e) => setText(e.target.value)}
              error={Boolean(parsed.error)}
              helperText={parsed.error ?? ""}
              slotProps={{
                input: {
                  autoComplete: "off",
                  endAdornment: (
                    <InputAdornment position="end">
                      <TextButton
                        onClick={() => {
                          if (!parsed.error) {
                            props.onSave?.(parsed.value);
                          }
                          modal.resolve(parsed.value);
                          void modal.hide();
                        }}
                        disabled={Boolean(parsed.error)}
                        sx={{ fontSize: 14 }}
                      >
                        关闭
                      </TextButton>
                    </InputAdornment>
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
