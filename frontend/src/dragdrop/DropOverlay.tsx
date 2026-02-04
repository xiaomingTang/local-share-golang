import { cat } from "common/error/catch-and-toast";
import { toError } from "common/error/utils";
import clsx from "clsx";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { StartSharing } from "wailsjs/go/main/App";
import { initShareFileDrop } from "./shareFileDrop";
import { mutate } from "swr";

async function sharingFromDroppedPaths(paths: string[]): Promise<string> {
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

export function DropOverlay() {
  const [dropOverlayActive, setDropOverlayActive] = useState(false);

  useEffect(() => {
    const tryStartSharingFromDroppedPaths = cat(async (paths: string[]) => {
      await sharingFromDroppedPaths(paths);
      await mutate("GetServerInfo");
      toast.success("已开始共享");
    });
    const cleanup = initShareFileDrop({
      setDropOverlayActive,
      tryStartSharingFromDroppedPaths,
    });
    return cleanup;
  }, []);

  return (
    <div
      className={clsx(
        "fixed inset-0 z-9999 justify-center items-center flex flex-col",
        "pointer-events-none select-none",
        "bg-black/35 backdrop-blur-sm",
        "transition-opacity duration-300",
        dropOverlayActive ? "opacity-100" : "opacity-0",
      )}
      aria-hidden={!dropOverlayActive}
    >
      <div className="text-lg font-semibold tracking-[0.5px]">
        拖拽文件夹到这里开始共享
      </div>
      <div className="mt-2 text-xs opacity-75">支持拖到窗口任意位置</div>
    </div>
  );
}
