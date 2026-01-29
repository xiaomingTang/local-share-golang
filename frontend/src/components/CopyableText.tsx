import { SxProps, Theme } from "@mui/material";
import { TextButton } from "./TextButton";
import { copyText } from "../utils";
import React from "react";

interface CopyTextProps {
  text?: string;
  sx?: SxProps<Theme>;
  children?: React.ReactNode;
}

export function CopyableText({ text, sx, children }: CopyTextProps) {
  const trimmedText = text?.trim() || "";

  return (
    <TextButton
      title={trimmedText ? "点击复制" : undefined}
      disabled={!trimmedText}
      sx={{
        textDecoration: trimmedText ? "underline" : "none",
        ...sx,
      }}
      onClick={() => {
        if (trimmedText) {
          copyText(trimmedText);
        }
      }}
    >
      {React.Children.count(children) > 0 ? children : (trimmedText ?? "-")}
    </TextButton>
  );
}
