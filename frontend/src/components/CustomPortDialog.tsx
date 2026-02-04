import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  InputAdornment,
  TextField,
} from "@mui/material";

import NiceModal, { useModal } from "@ebay/nice-modal-react";

import { muiDialogV5ReplaceOnClose } from "common/utils/muiDialogV5ReplaceOnClose";
import { FormEvent, useMemo } from "react";
import { TextButton } from "./TextButton";
import { useLoading } from "@zimi/hooks";
import { main } from "wailsjs/go/models";
import { useThrottlingState } from "common/utils/useThrottle";
import { cat } from "common/error/catch-and-toast";
import { autoFocus } from "common/utils/autoFocus";

function parsePortInputText(input: string): {
  port: number | null;
  error: string | null;
} {
  const trimmed = input.trim();
  if (!trimmed) return { port: null, error: null };
  if (!/^\d+$/.test(trimmed)) return { port: null, error: "端口必须是数字" };
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0 || n > 65535) {
    return { port: null, error: "端口范围应为 1-65535" };
  }
  return { port: n, error: null };
}

export interface CustomPortDialogProps {
  value: string;
  serverInfo?: main.ServerInfo;
  onSave?: (value: string) => void;
  onApply?: (value: string) => Promise<void>;
}

export const CustomPortDialog = NiceModal.create(
  (props: CustomPortDialogProps) => {
    const modal = useModal();
    const serverInfo = props.serverInfo;

    const [text, setText] = useThrottlingState(props.value ?? "", (v) => {
      if (!parsePortInputText(v).error) {
        props.onSave?.(v);
      }
    });

    const parsed = useMemo(() => parsePortInputText(text), [text]);
    const trimmed = text.trim();
    const [isLoading, withLoading] = useLoading();

    const buttonDisabled =
      Boolean(parsed.error) ||
      isLoading ||
      !serverInfo?.url ||
      !trimmed ||
      (parsed.port !== null && parsed.port === serverInfo.port);

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
        <DialogTitle>自定义端口</DialogTitle>
        <DialogContent>
          <Box
            component="form"
            sx={{ width: "100%", pt: 2 }}
            onSubmit={withLoading(
              cat(async (e: FormEvent) => {
                e.preventDefault();
                if (parsed.error || isLoading) {
                  return;
                }
                if (
                  serverInfo?.url &&
                  parsed.port !== null &&
                  parsed.port !== serverInfo.port
                ) {
                  await props.onApply?.(trimmed);
                }
                modal.resolve(trimmed);
                void modal.hide();
              }),
            )}
          >
            <TextField
              inputRef={autoFocus}
              size="small"
              fullWidth
              label="自定义端口"
              placeholder="如：8080"
              value={text}
              disabled={isLoading}
              onChange={(e) => setText(e.target.value)}
              error={!!parsed.error}
              helperText={parsed.error ?? "启动/切换时会优先使用该端口"}
              slotProps={{
                input: {
                  autoComplete: "off",
                  endAdornment: (
                    <InputAdornment position="end">
                      <TextButton
                        // 不能作为 'submit' 去 disabled, 否则会导致 Enter 不触发 form submit
                        type={buttonDisabled ? "button" : "submit"}
                        disabled={buttonDisabled}
                        sx={{ fontSize: 14 }}
                      >
                        立即应用
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
