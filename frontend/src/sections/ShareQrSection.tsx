import { Stack } from "@mui/material";
import ButtonBase from "@mui/material/ButtonBase";
import AdsClickIcon from "@mui/icons-material/AdsClick";
import { QRCodeCanvas } from "qrcode.react";
import clsx from "clsx";

import appIcon from "src/assets/appicon.png";
import { GetServerInfo, PickFolder, StartSharing } from "wailsjs/go/main/App";
import useSWR from "swr";
import { cat } from "common/error/catch-and-toast";

export interface ShareQrSectionProps {
  serverUrl?: string;
  onPickShare: () => void;
}

const SIZE = 240;

export function ShareQrSection() {
  const { data: serverInfo, mutate: mutateServerInfo } = useSWR(
    "GetServerInfo",
    () => GetServerInfo(),
  );

  const serverUrl = serverInfo?.url;

  const tryToShare = cat(async () => {
    const dir = await PickFolder();
    if (!dir) return;
    await StartSharing(dir);
    await mutateServerInfo();
  });

  return (
    <Stack spacing={2} direction="column" alignItems="center">
      {serverUrl && (
        <div className="flex justify-center items-center relative">
          <QRCodeCanvas
            className="bg-[#F3F3F3] rounded-lg p-4"
            bgColor="#F3F3F3"
            value={serverUrl}
            size={SIZE}
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
          sx={{
            width: SIZE,
            height: SIZE,
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
  );
}
