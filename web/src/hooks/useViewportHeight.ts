import { useEffect, useRef, useState } from "react";

export function useViewportHeight() {
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);

  useEffect(() => {
    const vv = window.visualViewport;
    const updateViewportHeight = () => {
      const nextHeight = vv?.height ?? window.innerHeight;
      setViewportHeight(Math.round(nextHeight));
    };

    updateViewportHeight();
    vv?.addEventListener("resize", updateViewportHeight);
    vv?.addEventListener("scroll", updateViewportHeight);
    window.addEventListener("resize", updateViewportHeight);

    return () => {
      vv?.removeEventListener("resize", updateViewportHeight);
      vv?.removeEventListener("scroll", updateViewportHeight);
      window.removeEventListener("resize", updateViewportHeight);
    };
  }, []);

  return viewportHeight;
}
