import throttle from "lodash-es/throttle";
import type { DebouncedFunc, ThrottleSettings } from "lodash-es";
import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { useMountedRef } from "./useMounted";

const defaultThrottleSettings: ThrottleSettings = {
  leading: true,
  trailing: true,
};

export function useThrottle<T extends (...args: any[]) => any>(
  func: T,
  waitMs = 400,
  options: ThrottleSettings = defaultThrottleSettings,
): DebouncedFunc<T> {
  const callback = useEffectEvent(func);

  const leading = options.leading ?? defaultThrottleSettings.leading;
  const trailing = options.trailing ?? defaultThrottleSettings.trailing;

  const throttled = useMemo(
    () =>
      throttle(((...args: Parameters<T>) => callback(...args)) as T, waitMs, {
        leading,
        trailing,
      }),
    [waitMs, leading, trailing],
  );

  useEffect(() => {
    return () => throttled.cancel();
  }, [throttled]);

  return throttled;
}

interface ThrottleProps {
  leading?: boolean;
  trailing?: boolean;
  wait?: number;
}

/**
 * 返回的 state 是即时的 state;
 * 但 callback 会 throttle 地执行。
 */
export function useThrottlingState<T>(
  defaultValue: T,
  callback: (value: T) => void,
  throttleProps?: ThrottleProps,
) {
  const [state, setState] = useState<T>(defaultValue);

  const throttledCallback = useThrottle(
    callback,
    throttleProps?.wait,
    throttleProps,
  );

  const didMountRef = useMountedRef();

  useEffect(() => {
    if (didMountRef.current) {
      throttledCallback(state);
    }
  }, [state, throttledCallback]);

  return [state, setState] as const;
}
