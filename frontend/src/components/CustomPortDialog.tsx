import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  TextField,
  Typography,
} from "@mui/material";

import NiceModal, { useModal } from "@ebay/nice-modal-react";

import { muiDialogV5ReplaceOnClose } from "@common/utils/muiDialogV5ReplaceOnClose";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { TextButton } from "./TextButton";
import { useLoading } from "@zimi/hooks";
import { main } from "wailsjs/go/models";
import { useThrottle } from "@common/utils/useThrottle";
import { useMountedRef } from "@common/utils/useMounted";
import { cat } from "@common/error/catch-and-toast";

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

    const [text, setText] = useState(props.value ?? "");

    const parsed = useMemo(() => parsePortInputText(text), [text]);
    const trimmed = text.trim();
    const [isLoading, withLoading] = useLoading();

    const applyDisabled =
      Boolean(parsed.error) ||
      isLoading ||
      !serverInfo?.url ||
      !trimmed ||
      (parsed.port !== null && parsed.port === serverInfo.port);

    const throttledOnSave = useThrottle((v: string) => props.onSave?.(v), 400, {
      leading: true,
      trailing: true,
    });
    const didMountRef = useMountedRef();
    useEffect(() => {
      if (didMountRef.current && !parsePortInputText(text).error) {
        throttledOnSave(text);
      }
    }, [throttledOnSave, text]);

    const autoFocus = useCallback((elem: HTMLInputElement) => {
      elem?.focus();
    }, []);

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
            sx={{ width: "100%", pt: 1 }}
            onSubmit={withLoading(
              cat(async (e: FormEvent) => {
                e.preventDefault();
                if (applyDisabled) return;
                await props.onApply?.(trimmed);
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
              error={Boolean(parsed.error)}
              helperText={parsed.error ?? "启动/切换时会优先使用该端口"}
              slotProps={{
                input: {
                  autoComplete: "off",
                  endAdornment: (
                    <InputAdornment position="end">
                      <TextButton
                        type="submit"
                        disabled={applyDisabled}
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
