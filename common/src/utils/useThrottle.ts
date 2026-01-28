import throttle from "lodash-es/throttle";
import type { DebouncedFunc, ThrottleSettings } from "lodash-es";
import { useEffect, useMemo, useRef } from "react";

export function useThrottle<T extends (...args: any[]) => any>(
  func: T,
  waitMs: number,
  options?: ThrottleSettings,
): DebouncedFunc<T> {
  const funcRef = useRef(func);
  useEffect(() => {
    funcRef.current = func;
  }, [func]);

  const leading = options?.leading ?? true;
  const trailing = options?.trailing ?? true;

  const throttled = useMemo(
    () =>
      throttle(
        ((...args: Parameters<T>) => funcRef.current(...args)) as T,
        waitMs,
        { leading, trailing },
      ),
    [waitMs, leading, trailing],
  );

  useEffect(() => {
    return () => throttled.cancel();
  }, [throttled]);

  return throttled;
}
