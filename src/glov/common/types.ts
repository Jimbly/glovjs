export interface ErrorCallback<T = unknown, E = unknown> {
  (err: E | undefined | null, result?: T | undefined | null): void;
}
