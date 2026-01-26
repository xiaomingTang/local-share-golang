export interface PlainError {
  code: number;
  message: string;
}

export const UNKNOWN_ERROR_TEXT = "未知错误";

export function toError(err: unknown): Error {
  if (err instanceof Error) {
    return err;
  }
  let message =
    (err as PlainError)?.message ??
    (err as any)?.msg ??
    (err as any)?.error ??
    (err as PromiseRejectedResult)?.reason ??
    (err as PlainError)?.toString() ??
    UNKNOWN_ERROR_TEXT;
  message = typeof message === "string" ? message : UNKNOWN_ERROR_TEXT;
  const retError = new Error(message);
  retError.code = (err as PlainError)?.code ?? 500;
  return retError;
}

export function toPlainError(inputError: unknown): PlainError {
  const err = toError(inputError);
  return {
    code: err.code ?? 500,
    message: err.message || UNKNOWN_ERROR_TEXT,
  };
}
