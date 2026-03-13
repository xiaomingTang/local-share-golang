declare global {
  interface Error {
    cause?: Error | undefined;
    code?: number | string | undefined;
    message: string;
  }

  type Func<Args extends unknown[] = unknown[], T = unknown> = (
    ...args: Args
  ) => T;
}

export {};
