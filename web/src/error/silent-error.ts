import { isError } from "lodash-es";

export const SilentErrorCode = 1000000;

export class SilentError extends Error {
  constructor(msg = "silent error") {
    super(msg);
    this.code = SilentErrorCode;
  }

  static isSilentError(err: unknown) {
    return isError(err) && err.code === SilentErrorCode;
  }
}
