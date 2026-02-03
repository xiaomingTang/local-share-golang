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
import { useThrottlingState } from "@common/utils/useThrottle";

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
    const [value, setValue] = useThrottlingState<DownloadZipSettingsValue>(
      props.value,
      (v) => {
        props.onSave?.(v);
      },
    );

    const enabled = new Set(value.enabledPresetKeys || []);

    function togglePreset(key: string, checked: boolean) {
      const next = new Set(value.enabledPresetKeys || []);
      if (checked) next.add(key);
      else next.delete(key);
      const nextObj = { ...value, enabledPresetKeys: Array.from(next) };
      setValue(nextObj);
    }

    return (
      <Dialog
        {...muiDialogV5ReplaceOnClose(modal)}
        maxWidth="sm"
        fullWidth
        slotProps={{
          paper: {
            sx: {
              backgroundColor: "#01132d",
            },
          },
        }}
      >
        <DialogTitle>下载设置</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1.5, opacity: 0.85 }}>
            配置批量下载打包时要忽略的目录/文件名。
          </Typography>

          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
            常见忽略项
          </Typography>
          <FormGroup sx={{ mb: 2, alignItems: "flex-start" }}>
            {DEFAULT_IGNORE_PRESETS.map((p) => (
              <FormControlLabel
                key={p.key}
                label={p.label}
                sx={{ mr: 0, pr: 2 }}
                control={
                  <Checkbox
                    size="small"
                    checked={enabled.has(p.key)}
                    onChange={(e) => togglePreset(p.key, e.target.checked)}
                  />
                }
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
