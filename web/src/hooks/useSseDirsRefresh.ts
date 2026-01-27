import { useEffect, useRef } from "react";

export function useSseDirsRefresh(params: {
  currentPath: string;
  onRefresh: () => void;
}) {
  const { currentPath, onRefresh } = params;

  const refreshTimer = useRef<number | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  function scheduleSilentRefresh() {
    if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(() => {
      onRefreshRef.current();
    }, 250);
  }

  useEffect(() => {
    if (typeof window.EventSource === "undefined") return;
    try {
      const es = new EventSource("/api/events");
      es.addEventListener("dirsChanged", (ev: MessageEvent) => {
        try {
          const payload = JSON.parse(String(ev.data || "{}")) as {
            dirs?: string[];
          };
          const dirs = Array.isArray(payload.dirs) ? payload.dirs : [];
          const cur = (currentPath || "").trim();
          if (dirs.includes(cur)) scheduleSilentRefresh();
        } catch {}
      });
      esRef.current = es;
      return () => {
        es.close();
      };
    } catch {
      return;
    }
  }, [currentPath]);

  useEffect(() => {
    return () => {
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
      if (esRef.current) esRef.current.close();
    };
  }, []);
}
