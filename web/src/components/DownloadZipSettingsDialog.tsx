import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormGroup,
  TextField,
  Typography,
} from "@mui/material";

import NiceModal, { useModal } from "@ebay/nice-modal-react";

import { muiDialogV5ReplaceOnClose } from "@common/utils/muiDialogV5ReplaceOnClose";
import { useThrottle } from "@common/utils/useThrottle";
import { SilentError } from "@common/error/silent-error";
import { useEffect, useState } from "react";
import { useMountedRef } from "@common/utils/useMounted";

export type DownloadZipIgnorePreset = {
  key: string;
  label: string;
  defaultSelected?: boolean;
};

export const DEFAULT_IGNORE_PRESETS: DownloadZipIgnorePreset[] = [
  { key: "node_modules", label: "node_modules", defaultSelected: true },
  { key: ".git", label: ".git", defaultSelected: true },
  { key: ".svn", label: ".svn", defaultSelected: true },
  { key: ".hg", label: ".hg", defaultSelected: true },
  { key: ".idea", label: ".idea", defaultSelected: true },
  { key: ".vscode", label: ".vscode", defaultSelected: false },
  { key: "__pycache__", label: "__pycache__", defaultSelected: true },
  { key: "venv", label: "venv", defaultSelected: true },
  { key: ".DS_Store", label: ".DS_Store", defaultSelected: true },
  { key: "Thumbs.db", label: "Thumbs.db", defaultSelected: true },
];

export type DownloadZipSettingsValue = {
  enabledPresetKeys: string[];
  customIgnore: string;
};

export function parseCustomIgnore(input: string) {
  return (input || "")
    .split(/[\n,]/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function buildIgnoreList(value: DownloadZipSettingsValue) {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const k of value.enabledPresetKeys || []) {
    const kk = (k || "").trim();
    if (!kk) continue;
    if (seen.has(kk)) continue;
    seen.add(kk);
    out.push(kk);
  }

  for (const k of parseCustomIgnore(value.customIgnore)) {
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

interface DownloadZipSettingsDialogProps {
  value: DownloadZipSettingsValue;
  onSave?: (value: DownloadZipSettingsValue) => void;
}

export const DownloadZipSettingsDialog = NiceModal.create(
  (props: DownloadZipSettingsDialogProps) => {
    const modal = useModal();
    const [value, setValue] = useState<DownloadZipSettingsValue>(props.value);

    const throttledOnSave = useThrottle(
      (v: DownloadZipSettingsValue) => props.onSave?.(v),
      400,
      { leading: true, trailing: true },
    );
    const didMountRef = useMountedRef();

    const enabled = new Set(value.enabledPresetKeys || []);

    function togglePreset(key: string, checked: boolean) {
      const next = new Set(value.enabledPresetKeys || []);
      if (checked) next.add(key);
      else next.delete(key);
      const nextObj = { ...value, enabledPresetKeys: Array.from(next) };
      setValue(nextObj);
    }

    useEffect(() => {
      if (didMountRef.current) {
        throttledOnSave(value);
      }
    }, [throttledOnSave, value]);

    return (
      <Dialog {...muiDialogV5ReplaceOnClose(modal)} maxWidth="sm" fullWidth>
        <DialogTitle>下载设置</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1.5, opacity: 0.85 }}>
            配置批量下载打包时要忽略的目录/文件名。
          </Typography>

          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
            常见忽略项
          </Typography>
          <FormGroup sx={{ mb: 2 }}>
            {DEFAULT_IGNORE_PRESETS.map((p) => (
              <FormControlLabel
                key={p.key}
                control={
                  <Checkbox
                    size="small"
                    checked={enabled.has(p.key)}
                    onChange={(e) => togglePreset(p.key, e.target.checked)}
                  />
                }
                label={p.label}
              />
            ))}
          </FormGroup>

          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
            自定义忽略
          </Typography>
          <TextField
            value={value.customIgnore}
            onChange={(e) =>
              setValue({ ...value, customIgnore: e.target.value })
            }
            placeholder={"例如：.env, secrets.txt\n也可以换行分隔"}
            helperText={
              "支持用逗号或换行分隔；支持填写相对路径前缀（如 frontend/node_modules）"
            }
            minRows={3}
            multiline
            fullWidth
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              modal.resolve(value);
              void modal.hide();
            }}
            variant="contained"
          >
            知道了
          </Button>
        </DialogActions>
      </Dialog>
    );
  },
);
