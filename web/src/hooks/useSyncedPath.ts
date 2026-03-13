import { useEffect, useState } from "react";
import {
  getPathFromUrl,
  normalizeSharePath,
  syncPathToUrl,
} from "src/utils/path";

export function useSyncedPath() {
  const [currentPath, setCurrentPath] = useState<string>(() =>
    getPathFromUrl(),
  );

  function setPath(path: string, options?: { replace?: boolean }) {
    const nextPath = normalizeSharePath(path);
    if (nextPath === currentPath) return;
    syncPathToUrl(nextPath, options);
    setCurrentPath(nextPath);
  }

  useEffect(() => {
    function handlePopState() {
      setCurrentPath(getPathFromUrl());
    }

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  return { currentPath, setPath };
}
