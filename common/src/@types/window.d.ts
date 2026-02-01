declare global {
  interface Error {
    cause?: Error;
    code?: number | string;
    message: string;
  }

  type Func<Args extends unknown[] = unknown[], T = unknown> = (
    ...args: Args
  ) => T;
}

export {};
