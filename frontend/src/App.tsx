import { useEffect, useState } from "react";
import useSWR, { SWRResponse } from "swr";

import {
  CheckContextMenuExists,
  GetServerInfo,
  PickFolder,
  SetContextMenuEnabled,
  StartSharing,
  StopSharing,
} from "../wailsjs/go/main/App";

import { EventsOn } from "../wailsjs/runtime/runtime";

import { toast } from "react-hot-toast";
import { useLoading } from "@zimi/hooks";
import { initShareFileDrop } from "./dragdrop/shareFileDrop";

import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";

import FolderIcon from "@mui/icons-material/Folder";
import OpenInBrowserRoundedIcon from "@mui/icons-material/OpenInBrowserRounded";

import GithubCornerSvg from "./assets/github-corner.svg?react";
import {
  checkForUpdate,
  copyText,
  openFolder,
  openUrlInBrowser,
} from "./utils";
import { cat } from "./error/catch-and-toast";
import { toError } from "./error/utils";
import { DropOverlay } from "./dragdrop/DropOverlay";
import {
  Box,
  ButtonBase,
  ButtonGroup,
  Stack,
  styled,
  Typography,
} from "@mui/material";

const GITHUB_REPO_URL =
  "https://github.com/xiaomingTang/local-share-golang/releases";

function ctxMenuExistsLabel(res: SWRResponse<boolean, unknown>) {
  if (res.error) return "检测失败（点击重试）";
  if (res.isValidating) return "检测中...";
  if (res.data === undefined) return "未知状态（点击重试）";
  return res.data ? "已启用（点击移除）" : "未启用（点击启用）";
}

async function sharingFromDroppedPaths(paths: string[]) {
  const list = Array.isArray(paths) ? paths.filter(Boolean) : [];
  if (list.length === 0) {
    throw new Error("没有识别到可共享的文件夹路径（请拖到提示面板上）");
  }

  let lastErr: Error | null = null;
  for (const p of list) {
    try {
      await StartSharing(p);
      return p;
    } catch (e) {
      lastErr = toError(e);
    }
  }

  if (!lastErr) {
    throw new Error("开始共享失败");
  }

  if (/不是文件夹/.test(lastErr.message)) {
    throw new Error("请拖拽文件夹开始共享");
  }
  throw lastErr;
}

function Row(props: { k?: React.ReactNode; v?: React.ReactNode }) {
  return (
    <Stack direction="row" spacing={2} alignItems="center">
      <Box
        sx={{
          minWidth: "110px",
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          color: "#A9ADB3",
        }}
      >
        {props.k}
      </Box>
      <Box
        sx={{
          flex: 1,
          display: "flex",
          justifyContent: "flex-start",
          alignItems: "center",
        }}
      >
        {props.v}
      </Box>
    </Stack>
  );
}

const TextButton = styled(Button)(({ theme }) => ({
  variant: "text",
  size: "small",
  minWidth: 0,
  padding: 0,
  textDecoration: "underline",
  textUnderlineOffset: "3px",
  color: "inherit",
  font: "inherit",
}));

function CopyableText(props: { text?: string }) {
  const trimmedText = props.text?.trim() || "";
  return (
    <TextButton
      title={trimmedText ? "点击复制" : undefined}
      disabled={!trimmedText}
      sx={{
        textDecoration: trimmedText ? "underline" : "none",
      }}
      onClick={() => {
        if (trimmedText) {
          copyText(trimmedText);
        }
      }}
    >
      {props.text ?? "-"}
    </TextButton>
  );
}

export default function App() {
  const [dropOverlayActive, setDropOverlayActive] = useState(false);

  const ctxMenuExistsRes = useSWR("CheckContextMenuExists", () =>
    CheckContextMenuExists().then((res) => !!res?.exists),
  );
  const { data: ctxMenuExists, mutate: mutateCtxMenuExists } = ctxMenuExistsRes;

  const [isCheckingUpdate, withCheckingUpdate] = useLoading();

  const { data: serverInfo, mutate: mutateServerInfo } = useSWR(
    "GetServerInfo",
    () => GetServerInfo(),
  );
  const sharedFolder = serverInfo?.sharedFolder;
  const serverUrl = serverInfo?.url;

  useEffect(() => {
    const tryStartSharingFromDroppedPaths = cat(async (paths: string[]) => {
      await sharingFromDroppedPaths(paths);
      await mutateServerInfo();
      toast.success("已开始共享");
    });
    const cleanup = initShareFileDrop({
      setDropOverlayActive,
      tryStartSharingFromDroppedPaths,
    });
    return cleanup;
  }, []);

  useEffect(() => {
    const cleanup = EventsOn("serverInfoChanged", () => mutateServerInfo());
    return cleanup;
  }, []);

  return (
    <>
      <div className="max-w-215 mx-auto relative p-4">
        <ButtonBase
          title="查看项目"
          aria-label="查看项目"
          sx={{ position: "absolute", right: 0, top: 0 }}
          onClick={() => {
            openUrlInBrowser(GITHUB_REPO_URL);
          }}
        >
          <GithubCornerSvg
            className="fill-white/75 text-[#1b2636]"
            aria-hidden="true"
          />
        </ButtonBase>

        <div className="bg-white/5 rounded-xl border border-white/10 p-4">
          <Box display="flex" justifyContent="center" alignItems="center">
            <ButtonGroup>
              <Button
                color="primary"
                variant="contained"
                onClick={cat(async () => {
                  const dir = await PickFolder();
                  if (!dir) return;
                  await StartSharing(dir);
                  await mutateServerInfo();
                })}
              >
                选择文件夹并开始共享
              </Button>
              <Button
                color="warning"
                variant="outlined"
                disabled={!sharedFolder}
                onClick={cat(async () => {
                  await StopSharing();
                  await mutateServerInfo();
                })}
              >
                停止共享
              </Button>
            </ButtonGroup>
          </Box>

          <div className="py-2 text-xs opacity-80 text-center">
            也可以把文件夹拖拽到窗口开始共享
          </div>

          <Row
            k="共享文件夹"
            v={
              <Stack direction="row" alignItems="center" spacing={1}>
                <CopyableText text={sharedFolder} />
                <IconButton
                  size="small"
                  aria-label="打开文件夹"
                  disabled={!sharedFolder}
                  onClick={() => openFolder(sharedFolder)}
                >
                  <FolderIcon
                    fontSize="inherit"
                    sx={{ color: sharedFolder ? "#FFD96D" : "inherit" }}
                  />
                </IconButton>
              </Stack>
            }
          />

          <Box height="4px" />

          <Row
            k="访问地址"
            v={
              <Stack direction="row" alignItems="center" spacing={1}>
                <CopyableText text={serverUrl} />
                <IconButton
                  size="small"
                  aria-label="在浏览器中打开"
                  disabled={!serverUrl}
                  onClick={() => openUrlInBrowser(serverUrl)}
                >
                  <OpenInBrowserRoundedIcon fontSize="inherit" />
                </IconButton>
              </Stack>
            }
          />

          <Stack
            spacing={1}
            direction="column"
            alignItems="center"
            className="mt-4"
          >
            <img className="qr" alt="二维码" src={serverInfo?.qrCode} />
            <div className="text-xs opacity-80">手机和电脑需要在同一局域网</div>
          </Stack>
        </div>

        <div className="bg-white/5 rounded-xl border border-white/10 p-4 mt-3">
          <Row
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

          <Box height="4px" />

          <Row
            k={
              <TextButton
                size="small"
                disabled={isCheckingUpdate}
                onClick={withCheckingUpdate(cat(async () => checkForUpdate()))}
              >
                {isCheckingUpdate ? "处理中..." : "检查更新"}
              </TextButton>
            }
            v={
              <Typography color="action.disabled">
                检查更新 不要太频繁，你会被 github 限流
              </Typography>
            }
          />
        </div>
      </div>
      <DropOverlay active={dropOverlayActive} />
    </>
  );
}
