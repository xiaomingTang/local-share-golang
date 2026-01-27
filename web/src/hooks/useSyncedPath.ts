import { useEffect, useState } from "react";
import { getPathFromUrl, syncPathToUrl } from "../utils/path";

export function useSyncedPath() {
  const [currentPath, setCurrentPath] = useState<string>(() =>
    getPathFromUrl(),
  );

  function setPath(path: string) {
    syncPathToUrl(path);
    setCurrentPath(path);
  }

  useEffect(() => {
    syncPathToUrl(currentPath);
  }, [currentPath]);

  return { currentPath, setPath };
}
