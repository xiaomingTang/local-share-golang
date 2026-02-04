import { useMemo } from "react";
import useSWR from "swr";
import { Typography } from "@mui/material";
import { useLoading } from "@zimi/hooks";

import { cat } from "common/error/catch-and-toast";
import { useRemoteSetting } from "common/storage";
import { KV } from "src/components/KV";
import { TextButton } from "src/components/TextButton";
import { checkForUpdate } from "src/utils";
import { GetVersion } from "wailsjs/go/main/App";

const UPDATE_CHECK_CLICK_KEY = "local-share:update-check-click" as const;
const UPDATE_CHECK_TIP_THRESHOLD = 10;
const UPDATE_CHECK_CLICK_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export function UpdateSection() {
  const { data: appVersion } = useSWR("GetVersion", () => GetVersion());

  const [updateCheckClicks, setUpdateCheckClicks] = useRemoteSetting<number[]>(
    UPDATE_CHECK_CLICK_KEY,
    [],
  );
  const [isCheckingUpdate, withCheckingUpdate] = useLoading();
  const showRateTip = useMemo(() => {
    const now = Date.now();
    const recent = updateCheckClicks.filter(
      (ts) => now - ts < UPDATE_CHECK_CLICK_WINDOW_MS,
    );
    return recent.length >= UPDATE_CHECK_TIP_THRESHOLD;
  }, [updateCheckClicks]);

  return (
    <>
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
                  return [...recent, now];
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
    </>
  );
}
