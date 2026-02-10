import ChatIcon from "@mui/icons-material/Chat";
import SendIcon from "@mui/icons-material/Send";
import RemoveCircleIcon from "@mui/icons-material/RemoveCircle";
import {
  Box,
  Drawer,
  IconButton,
  InputAdornment,
  OutlinedInput,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { useChat } from "common/hooks/useChat";
import { useEffect, useMemo, useRef, useState } from "react";
import NiceModal, { useModal } from "@ebay/nice-modal-react";
import { muiDialogV5ReplaceOnClose } from "common/utils/muiDialogV5ReplaceOnClose";
import { autoFocus } from "common/utils/autoFocus";
import { useHover } from "common/hooks/useHover";
import { Delay } from "common/components/Delay";
import { CopyButton } from "./CopyButton";
import { useViewportHeight } from "src/hooks/useViewportHeight";

interface ChatBoxProps {
  className?: string;
}

function MessageRow({ message, index }: { message: string; index: number }) {
  const { removeMessage } = useChat();
  const [hovered, handlers] = useHover();
  const isMultiLine = message.includes("\n");

  return (
    <Stack
      direction="row"
      gap={1}
      alignItems={isMultiLine ? "flex-start" : "center"}
      {...handlers}
    >
      <CopyButton
        size="small"
        title="复制消息内容"
        aria-label="复制消息内容"
        text={message}
        sx={{
          fontSize: "14px",
        }}
      />
      <Typography
        variant="body2"
        sx={{
          flexGrow: 1,
          p: 2,
          whiteSpace: "pre-wrap",
          backgroundColor: hovered
            ? "rgba(255, 255, 255, 0.15)"
            : "rgba(255, 255, 255, 0.1)",
          borderRadius: 1,
        }}
      >
        {message}
      </Typography>
      <IconButton
        size="small"
        title="删除消息"
        aria-label="删除消息"
        disabled={!hovered}
        color="error"
        sx={{
          fontSize: "14px",
          opacity: hovered ? 1 : 0,
          pointerEvents: hovered ? "auto" : "none",
        }}
        onClick={() => {
          removeMessage(index);
        }}
      >
        <RemoveCircleIcon sx={{ fontSize: "inherit", color: "inherit" }} />
      </IconButton>
    </Stack>
  );
}

export const ChatBox = NiceModal.create(function ChatBox(_: ChatBoxProps) {
  const modal = useModal();
  const { messages, addMessage } = useChat();
  const [text, setText] = useState("");
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const anchor = isMobile ? "bottom" : "left";
  const viewportHeight = useViewportHeight();
  const elemRef = useRef<HTMLElement | null>(null);

  const mobilePaperHeight = useMemo(() => {
    if (!isMobile) return undefined;
    if (!viewportHeight) return "clamp(300px, 80vh, 560px)";
    return `${viewportHeight * 0.9}px`;
  }, [isMobile, viewportHeight]);

  useEffect(() => {
    window.setTimeout(() => {
      elemRef.current?.scrollIntoView({
        block: "end",
        behavior: "smooth",
      });
    }, 50);
  }, [viewportHeight]);

  return (
    <Drawer
      anchor={anchor}
      {...muiDialogV5ReplaceOnClose(modal)}
      slotProps={{
        paper: {
          sx: {
            width: isMobile ? "100%" : "clamp(300px, 80vw, 600px)",
            height: isMobile ? mobilePaperHeight : "100%",
            backgroundColor: "#01132d",
          },
        },
      }}
    >
      <Stack direction="column" sx={{ height: "100%" }}>
        {messages.length > 0 && (
          <Stack
            direction="column"
            gap={2}
            sx={{
              p: 2,
              overflowY: "auto",
              scrollbarGutter: "stable",
              flexGrow: 1,
              minHeight: 0,
            }}
          >
            {messages.map((msg, index) => (
              <MessageRow key={`${index}-${msg}`} message={msg} index={index} />
            ))}
          </Stack>
        )}
        {messages.length === 0 && (
          <Stack
            direction="column"
            gap={2}
            sx={{
              justifyContent: "center",
              alignItems: "center",
              p: 2,
              flexGrow: 1,
              color: "rgba(255, 255, 255, 0.5)",
            }}
          >
            <ChatIcon sx={{ fontSize: 48, color: "inherit" }} />
            <Typography variant="body1" sx={{ color: "inherit" }}>
              没有消息，在下方输入框中可以发送消息
            </Typography>
          </Stack>
        )}
        {modal.visible && (
          <Delay ms={300}>
            <Box sx={{ p: 2 }} ref={elemRef}>
              <OutlinedInput
                autoFocus
                ref={autoFocus}
                fullWidth
                multiline
                minRows={1}
                maxRows={6}
                size="small"
                placeholder="Enter 发送消息，Shift+Enter 换行"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    text.trim() &&
                    !e.shiftKey &&
                    !e.altKey &&
                    !e.ctrlKey &&
                    !e.metaKey
                  ) {
                    e.preventDefault();
                    addMessage(text.trim());
                    setText("");
                  }
                }}
                endAdornment={
                  <InputAdornment position="end">
                    <IconButton
                      title="发送消息"
                      aria-label="发送消息"
                      edge="end"
                      disabled={!text.trim()}
                      onClick={() => {
                        addMessage(text.trim());
                        setText("");
                      }}
                    >
                      <SendIcon />
                    </IconButton>
                  </InputAdornment>
                }
              />
            </Box>
          </Delay>
        )}
      </Stack>
    </Drawer>
  );
});
