const { floor, min, random } = Math;
import { ErrorCallback } from 'glov/common/types.js';
import { perfCounterAdd } from 'glov/common/perfcounters.js';

/**
 * Parameters controlling the executeWithRetry function's behaviour
 */
export interface ExecuteWithRetryOptions {
  /** Max number of retry attempts */
  max_retries: number;
  /** Base backoff duration of each retry attempt that is incremental */
  inc_backoff_duration: number;
  /** Max backoff duration of each retry attempt */
  max_backoff: number;
  /** Optional error message prefix to add to the logs during retry attempts */
  log_prefix?: string | undefined | null;
  /** If true, all the output will be logged to the console as info */
  quiet?: boolean;
}

/**
 * Util function to generate a random integer in a range (inclusive)
 * @param {number} mn Minimum number
 * @param {number} mx Maximum number
 * @returns {number} A number in the specified range
 */
function randomNumber(mn: number, mx: number): number {
  return floor(random() * (mx - mn + 1)) + mn;
}

/**
 * Retry behaviour wrapper for a function with callback.
 * The function that is passed in has to have a handler callback function as its parameter to handle error/results.
 * @param {function} func Function to wrap with retry mechanism
 * @param {ExecuteWithRetryOptions} options Parameters controlling this function's behaviour
 * @param {function} cb Callback function
 * @returns {void}
 */
export function executeWithRetry<T = unknown, E = unknown>(
  func: (cb: ErrorCallback<T, E>) => void,
  options: ExecuteWithRetryOptions,
  cb: ErrorCallback<T, E>): void {
  let max_retries = options.max_retries;
  let inc_backoff_duration = options.inc_backoff_duration;
  let max_backoff = options.max_backoff;
  let log_prefix = options.log_prefix || 'Log';
  let quiet = options.quiet;

  let attempts = 0;

  function execute() {
    attempts++;

    // Execute the funtion that was passed in with a callback handler function as a parameter
    func(function (err: E | undefined | null, res: T | undefined | null) {
      if (!err) {
        if (attempts !== 1) {
          console.info(`[RETRY] ${log_prefix} | [${attempts}] | Finally succeeded`);
        }
        return cb(null, res);
      } else {
        // If there was an error, try again if we have not exceeded max retries
        if (attempts === max_retries) {
          // Return the error if we have exceeded max retries
          (quiet ? console.info : console.error)(`[RETRY] ${log_prefix} | [Retries exhausted] | ${err}`);
          return cb(err);
        }

        (quiet ? console.info : console.warn)(`[RETRY] ${log_prefix} | [${attempts}] | ${err}`);
        perfCounterAdd(`retry.${log_prefix}`);

        // Delay before next attempt with added jitter factor to the duration
        // to reduce occasions of multiple calls happening overly close to one another
        return setTimeout(execute, min(attempts * inc_backoff_duration, max_backoff) + randomNumber(100, 300));
      }
    });
  }

  execute();
}
