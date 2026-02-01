import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Setter } from "./TypedStorage";
import { getWebToken } from "./web-token";

function hasWailsSettingsBridge(): boolean {
  const w = globalThis as any;
  return Boolean(w?.go?.main?.App?.GetSetting && w?.go?.main?.App?.SetSetting);
}

async function wailsGet(key: string): Promise<string> {
  const w = globalThis as any;
  return w.go.main.App.GetSetting(String(key));
}

async function wailsSet(key: string, valueJson: string): Promise<void> {
  const w = globalThis as any;
  await w.go.main.App.SetSetting(String(key), valueJson);
}

async function getRemoteSetting<T>(key: string): Promise<T | undefined> {
  if (!key) return undefined;

  if (hasWailsSettingsBridge()) {
    const raw = await wailsGet(key);
    if (!raw) return undefined;
    return JSON.parse(raw) as T;
  }

  const token = getWebToken();

  const res = await fetch(`/api/settings/${encodeURIComponent(key)}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...(token ? { "X-Share-Token": token } : {}),
    },
  });

  if (res.status === 404) return undefined;
  if (!res.ok) {
    throw new Error(`get setting failed: ${res.status}`);
  }

  const data = (await res.json()) as { value?: T };
  if (!data || !("value" in data)) return undefined;
  return data.value as T;
}

async function setRemoteSetting<T>(
  key: string,
  value: T | null,
): Promise<void> {
  if (!key) return;

  const valueJson = JSON.stringify(value);

  if (hasWailsSettingsBridge()) {
    await wailsSet(key, valueJson);
    return;
  }

  const token = getWebToken();

  const res = await fetch(`/api/settings/${encodeURIComponent(key)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(token ? { "X-Share-Token": token } : {}),
    },
    body: JSON.stringify({ value }),
  });

  if (!res.ok) {
    throw new Error(`set setting failed: ${res.status}`);
  }
}

export const remoteSetting = {
  get: getRemoteSetting,
  set: setRemoteSetting,
} as const;

export function useRemoteSetting<T>(
  key: string,
  fallback?: undefined,
): [
  T | undefined,
  (value: Setter<T | undefined>) => void,
  { loading: boolean; error: Error | null },
];
export function useRemoteSetting<T>(
  key: string,
  fallback: T,
): [
  T,
  (value: T | undefined | Func<[T], T | undefined>) => void,
  { loading: boolean; error: Error | null },
];
export function useRemoteSetting<T>(key: string, fallback?: T) {
  const [state, setState] = useState<T | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const fallbackRef = useRef(fallback);

  fallbackRef.current = fallback;

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const v = await remoteSetting.get<T>(key);
        if (cancelled) return;
        if (v !== undefined) {
          setState(v);
        } else {
          setState(undefined);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e as Error);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [key]);

  const setValue = useCallback(
    (value: Setter<T | undefined>) => {
      setState((prev) => {
        const next =
          typeof value === "function"
            ? (value as Func<[T | undefined], T | undefined>)(
                prev ?? fallbackRef.current,
              )
            : value;
        void remoteSetting.set(key, next).catch(() => {
          // ignore
        });
        return next;
      });
    },
    [key],
  );

  return [state ?? fallbackRef.current, setValue, { loading, error }] as const;
}
