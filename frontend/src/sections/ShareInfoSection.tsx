import { Box, Stack } from "@mui/material";
import useSWR from "swr";
import { GetServerInfo } from "wailsjs/go/main/App";

import { KV } from "src/components/KV";
import { TextButton } from "src/components/TextButton";
import { openFolder, openUrlInBrowser } from "src/utils";
import { CopyButton } from "src/components/CopyButton";

export interface ShareInfoSectionProps {
  sharedFolder?: string;
  serverUrl?: string;
}

export function ShareInfoSection() {
  const { data: serverInfo } = useSWR("GetServerInfo", () => GetServerInfo());

  const sharedFolder = serverInfo?.sharedFolder;
  const serverUrl = serverInfo?.url;

  return (
    <>
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
            <CopyButton
              disabled={!sharedFolder}
              size="small"
              title="复制文件夹路径"
              aria-label="复制文件夹路径"
              text={sharedFolder}
              sx={{ fontSize: "14px" }}
            />
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
            <CopyButton
              disabled={!serverUrl}
              size="small"
              title="复制访问地址"
              aria-label="复制访问地址"
              text={serverUrl}
              sx={{ fontSize: "14px" }}
            />
          </Stack>
        }
      />
    </>
  );
}
