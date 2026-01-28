import { useState } from "react";

import { TypedStorage, type Setter } from "./TypedStorage";

export function useStorage<K extends keyof S, S extends Record<string, any>>(
  storage: TypedStorage<S>,
  key: K,
  fallback?: undefined,
): [S[K] | null, (value: Setter<S[K] | null>) => void];
export function useStorage<K extends keyof S, S extends Record<string, any>>(
  storage: TypedStorage<S>,
  key: K,
  fallback: S[K],
): [S[K], (value: Setter<S[K] | null>) => void];
export function useStorage<K extends keyof S, S extends Record<string, any>>(
  storage: TypedStorage<S>,
  key: K,
  fallback?: S[K],
) {
  type V = S[K] | null;
  const [state, setState] = useState<V>(() =>
    storage.get(key, fallback as any),
  );

  function setValue(value: Setter<S[K] | null>) {
    storage.set(key, value);
    setState((prev: V) => {
      if (typeof value === "function") {
        return (
          (value as Func<[S[K] | null], S[K] | null>)(prev) ?? fallback ?? null
        );
      }
      return value ?? fallback ?? null;
    });
  }

  return [state, setValue] as const;
}
