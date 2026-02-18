const __DEV__ = import.meta.env.DEV;

export const log = __DEV__
  ? (...args: unknown[]) => console.log(...args)
  : () => {};

export const warn = __DEV__
  ? (...args: unknown[]) => console.warn(...args)
  : () => {};

export const error = __DEV__
  ? (...args: unknown[]) => console.error(...args)
  : () => {};
