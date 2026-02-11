import useSWR, { SWRResponse } from "swr";

import NiceModal from "@ebay/nice-modal-react";
import {
  Checkbox,
  FormControlLabel,
  FormGroup,
  SxProps,
  Theme,
  Typography,
} from "@mui/material";

import {
  ApplyCustomPorts,
  CheckContextMenuExists,
  GetServerInfo,
  SetContextMenuEnabled,
} from "wailsjs/go/main/App";

import { useRemoteSetting } from "common/storage";
import { cat } from "common/error/catch-and-toast";

import { KV } from "src/components/KV";
import { TextButton } from "src/components/TextButton";
import { CustomPortDialog } from "src/components/CustomPortDialog";
import { AccessPassDialog } from "src/components/AccessPassDialog";

const CUSTOM_PORT_KEY = "local-share:custom-port" as const;
const ACCESS_PASS_KEY = "local-share:access-pass" as const;
const PERMISSIONS_KEY = "local-share:permissions" as const;

function ctxMenuExistsLabel(res: SWRResponse<boolean, unknown>) {
  if (res.error) return "检测失败（点击重试）";
  if (res.isValidating) return "检测中...";
  if (res.data === undefined) return "未知状态（点击重试）";
  return res.data ? "已启用（点击移除）" : "未启用（点击启用）";
}

export function SettingOfContextMenu() {
  const ctxMenuExistsRes = useSWR("CheckContextMenuExists", () =>
    CheckContextMenuExists().then((res) => !!res?.exists),
  );
  const { data: ctxMenuExists, mutate: mutateCtxMenuExists } = ctxMenuExistsRes;

  return (
    <KV
      k="右键菜单"
      v={
        <TextButton
          sx={{
            color: ctxMenuExists ? "primary.main" : "action.disabled",
          }}
          onClick={cat(async () => {
            await SetContextMenuEnabled(!ctxMenuExists);
            await mutateCtxMenuExists();
          })}
        >
          {ctxMenuExistsLabel(ctxMenuExistsRes)}
        </TextButton>
      }
    />
  );
}

export function SettingOfCustomPort() {
  const [customPortText, setCustomPortText] = useRemoteSetting<string>(
    CUSTOM_PORT_KEY,
    "",
  );

  const { data: serverInfo, mutate: mutateServerInfo } = useSWR(
    "GetServerInfo",
    () => GetServerInfo(),
  );

  // 不能用 cat 包裹，错误需要抛出，业务中要用
  const applyCustomPortText = async (text: string) => {
    await ApplyCustomPorts(String(text).trim());
    await mutateServerInfo();
  };

  return (
    <KV
      k={
        <TextButton
          onClick={() => {
            void NiceModal.show(CustomPortDialog, {
              value: customPortText,
              serverInfo,
              onSave: (v) => setCustomPortText(v),
              onApply: (v) => applyCustomPortText(v),
            });
          }}
        >
          自定义端口
        </TextButton>
      }
      v={<Typography color="action.disabled">{customPortText}</Typography>}
    />
  );
}

export function SettingOfAccessPass() {
  const [accessPassText, setAccessPassText] = useRemoteSetting<string>(
    ACCESS_PASS_KEY,
    "",
  );

  return (
    <KV
      k={
        <TextButton
          onClick={() => {
            void NiceModal.show(AccessPassDialog, {
              value: accessPassText,
              onSave: (v) => setAccessPassText(v),
            });
          }}
        >
          访问口令
        </TextButton>
      }
      v={<Typography color="action.disabled">{accessPassText}</Typography>}
    />
  );
}

type PermissionSetting = {
  read?: boolean | undefined;
  write?: boolean | undefined;
  delete?: boolean | undefined;
};

const DEFAULT_PERMISSIONS: PermissionSetting = {
  read: true,
  write: true,
  delete: false,
};

const checkBoxSx: SxProps<Theme> = {
  [`&.MuiCheckbox-root`]: {
    py: 0.5,
    px: 1,
    ml: 1,
  },
};

export function SettingOfPermissions() {
  const [permissions, setPermissions] = useRemoteSetting<PermissionSetting>(
    PERMISSIONS_KEY,
    DEFAULT_PERMISSIONS,
  );

  const current = {
    read: permissions?.read ?? DEFAULT_PERMISSIONS.read,
    write: permissions?.write ?? DEFAULT_PERMISSIONS.write,
    delete: permissions?.delete ?? DEFAULT_PERMISSIONS.delete,
  };

  const update = (patch: Partial<PermissionSetting>) => {
    setPermissions({ ...current, ...patch });
  };

  return (
    <KV
      k="权限管理"
      v={
        <FormGroup row sx={{ pl: 1 }}>
          <FormControlLabel
            label="读"
            control={
              <Checkbox
                size="small"
                checked={current.read}
                sx={checkBoxSx}
                onChange={(e) => update({ read: e.target.checked })}
              />
            }
          />
          <FormControlLabel
            label="写"
            control={
              <Checkbox
                size="small"
                checked={current.write}
                sx={checkBoxSx}
                onChange={(e) => update({ write: e.target.checked })}
              />
            }
          />
          <FormControlLabel
            label="删除"
            control={
              <Checkbox
                size="small"
                checked={current.delete}
                sx={checkBoxSx}
                onChange={(e) => update({ delete: e.target.checked })}
              />
            }
          />
        </FormGroup>
      }
    />
  );
}
