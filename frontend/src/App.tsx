import { useEffect, useState } from "react";
import useSWR, { SWRResponse } from "swr";
import { QRCodeCanvas } from "qrcode.react";

import NiceModal from "@ebay/nice-modal-react";

import {
  ApplyCustomPorts,
  CheckContextMenuExists,
  GetServerInfo,
  GetVersion,
  PickFolder,
  SetContextMenuEnabled,
  StartSharing,
  StopSharing,
} from "../wailsjs/go/main/App";

import { toast } from "react-hot-toast";
import { useLoading } from "@zimi/hooks";
import { initShareFileDrop } from "./dragdrop/shareFileDrop";

import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";

import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import AdsClickIcon from "@mui/icons-material/AdsClick";

import appIcon from "./assets/appicon.png";
import GithubCornerSvg from "./assets/github-corner.svg?react";
import {
  checkForUpdate,
  copyText,
  openFolder,
  openUrlInBrowser,
} from "./utils";
import { cat } from "@common/error/catch-and-toast";
import { toError } from "@common/error/utils";
import { DropOverlay } from "./dragdrop/DropOverlay";
import { Box, ButtonBase, ButtonGroup, Stack, Typography } from "@mui/material";
import clsx from "clsx";
import { useRemoteSetting } from "@common/storage";
import { useEventsOn } from "./hooks/useEventsOn";
import { CustomPortDialog } from "./components/CustomPortDialog";
import { TextButton } from "./components/TextButton";
import { KV } from "./components/KV";
import { CopyableText } from "./components/CopyableText";

const GITHUB_REPO_URL =
  "https://github.com/xiaomingTang/local-share-golang/releases";

const UPDATE_CHECK_CLICK_KEY = "local-share:update-check-click" as const;
const CUSTOM_PORT_KEY = "local-share:custom-port" as const;
const UPDATE_CHECK_TIP_THRESHOLD = 10;
const UPDATE_CHECK_CLICK_WINDOW_MS = 60 * 60 * 1000; // 1 hour

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

export default function App() {
  const [dropOverlayActive, setDropOverlayActive] = useState(false);
  const [showRateTip, setShowRateTip] = useState(false);
  const [updateCheckClicks, setUpdateCheckClicks] = useRemoteSetting<number[]>(
    UPDATE_CHECK_CLICK_KEY,
    [],
  );

  useEffect(() => {
    const now = Date.now();
    const recent = updateCheckClicks.filter(
      (ts) => now - ts < UPDATE_CHECK_CLICK_WINDOW_MS,
    );
    setShowRateTip(recent.length >= UPDATE_CHECK_TIP_THRESHOLD);
  }, [updateCheckClicks]);

  const ctxMenuExistsRes = useSWR("CheckContextMenuExists", () =>
    CheckContextMenuExists().then((res) => !!res?.exists),
  );
  const { data: ctxMenuExists, mutate: mutateCtxMenuExists } = ctxMenuExistsRes;

  const [isCheckingUpdate, withCheckingUpdate] = useLoading();

  const [customPortText, setCustomPortText] = useRemoteSetting<string>(
    CUSTOM_PORT_KEY,
    "",
  );

  const [isStartingSharing, withStartingSharing] = useLoading();
  const [isApplyingPorts, withApplyingPorts] = useLoading();

  const { data: serverInfo, mutate: mutateServerInfo } = useSWR(
    "GetServerInfo",
    () => GetServerInfo(),
  );
  const sharedFolder = serverInfo?.sharedFolder;
  const serverUrl = serverInfo?.url;

  const { data: appVersion } = useSWR("GetVersion", () => GetVersion());

  const tryToShare = withStartingSharing(
    cat(async () => {
      const dir = await PickFolder();
      if (!dir) return;
      await StartSharing(dir);
      await mutateServerInfo();
    }),
  );

  useEffect(() => {
    const tryStartSharingFromDroppedPaths = withStartingSharing(
      cat(async (paths: string[]) => {
        await sharingFromDroppedPaths(paths);
        await mutateServerInfo();
        toast.success("已开始共享");
      }),
    );
    const cleanup = initShareFileDrop({
      setDropOverlayActive,
      tryStartSharingFromDroppedPaths,
    });
    return cleanup;
  }, []);

  useEventsOn("serverInfoChanged", () => mutateServerInfo());
  useEventsOn("toastError", (msg: unknown) => {
    const text = typeof msg === "string" ? msg : String(msg ?? "");
    if (text) toast.error(text);
  });

  const applyCustomPortText = withApplyingPorts(async (text: string) => {
    await ApplyCustomPorts(String(text).trim());
    await mutateServerInfo();
  });

  return (
    <>
      <div className="max-w-215 mx-auto relative p-4">
        <ButtonBase
          title="查看项目"
          focusRipple
          aria-label="查看项目"
          sx={{ position: "absolute", right: 0, top: 0 }}
          onClick={() => openUrlInBrowser(GITHUB_REPO_URL)}
        >
          <GithubCornerSvg
            className="fill-white/75 text-[#1b2636]"
            aria-hidden="true"
          />
        </ButtonBase>

        <div className="bg-white/5 rounded-xl border border-white/10 p-4">
          <Box display="flex" justifyContent="center" alignItems="center">
            <ButtonGroup>
              <Button color="primary" variant="contained" onClick={tryToShare}>
                {sharedFolder && "选择其他文件夹共享"}
                {!sharedFolder && "选择文件夹开始共享"}
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

          <KV
            k="共享文件夹"
            hidden={!serverUrl}
            v={
              <Stack direction="row" alignItems="center" spacing={1}>
                <TextButton
                  disabled={!sharedFolder}
                  onClick={() => openFolder(sharedFolder)}
                >
                  {sharedFolder}
                </TextButton>
                <IconButton
                  disabled={!sharedFolder}
                  size="small"
                  title="复制文件夹路径"
                  aria-label="复制文件夹路径"
                  onClick={() => copyText(sharedFolder ?? "")}
                >
                  <ContentCopyIcon
                    fontSize="inherit"
                    sx={{ color: "inherit" }}
                  />
                </IconButton>
              </Stack>
            }
          />

          <Box height="4px" />

          <KV
            k="访问地址"
            hidden={!serverUrl}
            v={
              <Stack direction="row" alignItems="center" spacing={1}>
                <TextButton
                  disabled={!serverUrl}
                  onClick={() => openUrlInBrowser(serverUrl)}
                >
                  {serverUrl}
                </TextButton>
                <IconButton
                  disabled={!serverUrl}
                  size="small"
                  title="复制访问地址"
                  aria-label="复制访问地址"
                  onClick={() => copyText(serverUrl ?? "")}
                >
                  <ContentCopyIcon
                    fontSize="inherit"
                    sx={{ color: "inherit" }}
                  />
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
            {serverUrl && (
              <div className="flex justify-center items-center relative">
                <QRCodeCanvas
                  className="bg-[#F3F3F3] rounded-lg p-4"
                  bgColor="#F3F3F3"
                  value={serverUrl}
                  size={240}
                />
                <img
                  src={appIcon}
                  alt="logo"
                  className={clsx(
                    "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
                    "w-10 h-10 p-1 rounded-md bg-[#F3F3F3]",
                    "pointer-events-none select-none",
                  )}
                />
              </div>
            )}
            {!serverUrl && (
              <ButtonBase
                title="点击选择文件夹开始共享"
                focusRipple
                className="size-60"
                sx={{
                  gap: 1,
                  borderRadius: 2,
                  backgroundColor: "rgba(255, 255, 255, 0.1)",
                  color: "rgba(255, 255, 255, 0.7)",
                  fontWeight: "medium",
                  flexDirection: "column",
                }}
                onClick={tryToShare}
              >
                <AdsClickIcon fontSize="large" />
              </ButtonBase>
            )}
            <div
              className={clsx(
                "text-xs transition-opacity duration-300",
                serverUrl
                  ? "opacity-80"
                  : "opacity-0 select-none pointer-events-none",
              )}
            >
              手机和电脑需要在同一局域网
            </div>
          </Stack>
        </div>

        <div className="bg-white/5 rounded-xl border border-white/10 p-4 mt-3">
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

          <KV
            sx={{ mt: 1, mb: 1 }}
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
            v={
              <Typography color="action.disabled">{customPortText}</Typography>
            }
          />

          <KV
            k={
              <TextButton
                size="small"
                disabled={isCheckingUpdate}
                onClick={withCheckingUpdate(
                  cat(async () => {
                    const now = Date.now();
                    setUpdateCheckClicks((prev) => {
                      const recent = prev.filter(
                        (ts) => now - ts < UPDATE_CHECK_CLICK_WINDOW_MS,
                      );
                      const next = [...recent, now];
                      setShowRateTip(next.length >= UPDATE_CHECK_TIP_THRESHOLD);
                      return next;
                    });
                    await checkForUpdate();
                  }),
                )}
              >
                {isCheckingUpdate ? "处理中..." : "检查更新"}
              </TextButton>
            }
            v={
              <Typography color="action.disabled">
                {showRateTip && "检查更新不要太频繁，你会被 github 限流的"}
                {!showRateTip && appVersion}
              </Typography>
            }
          />
        </div>
      </div>
      <DropOverlay active={dropOverlayActive} />
    </>
  );
}
