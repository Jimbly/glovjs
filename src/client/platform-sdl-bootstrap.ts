// very light file that cannot import any engine code, just display a crash message
import {
  bootstrapHandleError,
  bootstrapHandleRejection,
  bootstrapSetCrashDisplayFunc,
} from 'glov/client/bootstrap';

process.on('uncaughtException', function (err, origin) {
  bootstrapHandleError(null, null, null, null, err);
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
process.on('unhandledRejection', function (reason: any, promise) {
  if (!reason) {
    reason = {};
  }
  let event = {
    reason,
    type: 'unhandledrejection',
  };
  bootstrapHandleRejection(event);
});

function sdlDisplayCrash(msg: string, clear?: boolean): void {
  if (clear && msg) {
    console.error('######## UNHANDLED EXCEPTION ########');
  }
  console.error(msg);
}
bootstrapSetCrashDisplayFunc(sdlDisplayCrash);
