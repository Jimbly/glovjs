export interface ErrorCallback<T = void, E = unknown> {
  (err: E | undefined | null, result?: T | undefined | null): void;
}
