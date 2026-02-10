import { MouseEvent, useRef, useState } from "react";
import { IconButton, IconButtonProps, useEventCallback } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DoneIcon from "@mui/icons-material/Done";

import { cat } from "common/error/catch-and-toast";
import { copyText } from "src/utils/copy";

interface CopyButtonProps extends Omit<IconButtonProps, "children"> {
  text?: string | undefined;
}

export function useCopy(delayMs = 2000) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  const copy = useEventCallback(async (text: string) => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }
    await copyText(text);
    setCopied(true);
    timerRef.current = window.setTimeout(() => setCopied(false), delayMs);
  });

  return { copied, copy };
}

export function CopyButton(props: CopyButtonProps) {
  const { text, onClick: rawOnClick, ...rest } = props;
  const { copied, copy } = useCopy();

  const onClick = cat(async (e: MouseEvent<HTMLButtonElement>) => {
    rawOnClick?.(e);
    if (!text) {
      throw new Error("待复制的文本为空");
    }
    await copy(text);
  });

  return (
    <IconButton
      {...rest}
      onClick={onClick}
      title={copied ? "复制成功" : props.title}
      aria-label={copied ? "复制成功" : props["aria-label"]}
    >
      {copied && (
        <DoneIcon sx={{ color: "primary.main", fontSize: "inherit" }} />
      )}
      {!copied && (
        <ContentCopyIcon sx={{ color: "inherit", fontSize: "inherit" }} />
      )}
    </IconButton>
  );
}
