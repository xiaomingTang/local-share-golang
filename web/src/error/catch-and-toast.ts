"use client";

import { toError, UNKNOWN_ERROR_TEXT } from "./utils";
import { SilentError } from "./silent-error";
import toast from "react-hot-toast";

type AwaitedValue<T> = T extends Promise<infer S> ? S : T;

/**
 * catch and toast
 */
export function cat<Args extends unknown[], Ret>(
  callback: Func<Args, Ret>,
): Func<Args, Promise<AwaitedValue<Ret> | undefined>> {
  return async (...args) => {
    try {
      const ret = (await callback(...args)) as AwaitedValue<Ret>;
      return ret;
    } catch (catchError) {
      const error = toError(catchError);
      if (!SilentError.isSilentError(error)) {
        toast.error(error.message || UNKNOWN_ERROR_TEXT);
      }
      return undefined;
    }
  };
}
