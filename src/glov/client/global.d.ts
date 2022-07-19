declare module 'glov/client/global' {
  global {
    interface Window {
      // GLOV injected variables
      conf_platform?: string;
      conf_env?: string;

      // External injected variables
      FB?: unknown;
      FBInstant?: unknown;
      androidwrapper?: unknown;
      webkit?: { messageHandlers?: { iosWrapper?: unknown } };

      // GLOV bootstrap
      debugmsg: (msg: string, clear: boolean) => void;

      // GLOV profiler
      profilerStart: (name: string, count?: number) => void;
      profilerStop: (name: string) => void;
      profilerStopStart: (name: string, count?: number) => void;
    }

    // GLOV ui.js
    let Z: Record<string, number>;
  }
}
