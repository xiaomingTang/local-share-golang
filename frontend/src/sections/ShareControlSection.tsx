import { cat } from "common/error/catch-and-toast";
import { Box, Button, ButtonGroup } from "@mui/material";
import useSWR from "swr";
import {
  GetServerInfo,
  PickFolder,
  StartSharing,
  StopSharing,
} from "wailsjs/go/main/App";

export function ShareControlSection() {
  const { data: serverInfo, mutate: mutateServerInfo } = useSWR(
    "GetServerInfo",
    () => GetServerInfo(),
  );
  const sharedFolder = serverInfo?.sharedFolder;

  const tryToShare = cat(async () => {
    const dir = await PickFolder();
    if (!dir) return;
    await StartSharing(dir);
    await mutateServerInfo();
  });

  return (
    <>
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

      <div className="pt-2 pb-1.5 text-xs opacity-80 text-center">
        也可以把文件夹拖拽到窗口开始共享
      </div>
    </>
  );
}
