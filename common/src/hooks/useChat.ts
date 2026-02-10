import { useCallback } from "react";
import { useRemoteSetting } from "../storage";

export const CHAT_MESSAGES_KEY = "local-share:chat-messages" as const;

export function useChat() {
  const [messages, setMessages] = useRemoteSetting(
    CHAT_MESSAGES_KEY,
    [] as string[],
  );

  const addMessage = useCallback((msg: string) => {
    setMessages((prev) => [...prev, msg.trim()]);
  }, []);

  const removeMessage = useCallback((msg: string | number) => {
    setMessages((prev) => {
      if (typeof msg === "number") {
        return prev.filter((_, index) => index !== msg);
      } else {
        const trimmedMsg = msg.trim();
        return prev.filter((m) => m !== trimmedMsg);
      }
    });
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    setMessages,
    addMessage,
    removeMessage,
    clearMessages,
  };
}
