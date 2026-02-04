import { useEventCallback } from "@mui/material";
import { useEffect } from "react";
import { EventsOn } from "wailsjs/runtime/runtime";

export function useEventsOn(event: string, handler: (...e: any[]) => void) {
  const fn = useEventCallback(handler);

  useEffect(() => {
    const cleanup = EventsOn(event, fn);
    return cleanup;
  }, [event, fn]);
}
