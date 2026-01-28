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

export type DownloadZipIgnorePreset = {
  key: string;
  label: string;
};

export const DEFAULT_IGNORE_PRESETS: DownloadZipIgnorePreset[] = [
  { key: "node_modules", label: "node_modules" },
  { key: ".git", label: ".git" },
  { key: ".svn", label: ".svn" },
  { key: ".hg", label: ".hg" },
  { key: ".idea", label: ".idea" },
  { key: ".vscode", label: ".vscode" },
  { key: ".DS_Store", label: ".DS_Store" },
  { key: "Thumbs.db", label: "Thumbs.db" },
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

export function DownloadZipSettingsDialog(props: {
  open: boolean;
  value: DownloadZipSettingsValue;
  onChange: (next: DownloadZipSettingsValue) => void;
  onClose: () => void;
}) {
  const { open, value, onChange, onClose } = props;

  const enabled = new Set(value.enabledPresetKeys || []);

  function togglePreset(key: string, checked: boolean) {
    const next = new Set(value.enabledPresetKeys || []);
    if (checked) next.add(key);
    else next.delete(key);
    onChange({ ...value, enabledPresetKeys: Array.from(next) });
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
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
          onChange={(e) => onChange({ ...value, customIgnore: e.target.value })}
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
        <Button onClick={onClose}>关闭</Button>
      </DialogActions>
    </Dialog>
  );
}
