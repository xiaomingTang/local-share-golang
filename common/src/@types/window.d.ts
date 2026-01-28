declare global {
  interface Error {
    cause?: Error;
    code?: number;
    message: string;
  }

  type Func<Args extends unknown[] = unknown[], T = unknown> = (
    ...args: Args
  ) => T;
}

export {};
