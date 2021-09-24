const { floor, min, random } = Math;

/**
 * Util function to generate a random integer in a range (inclusive)
 * @param {number} mn Minimum number
 * @param {number} mx Maximum number
 * @returns {number} A number in the specified range
 */
function randomNumber(mn, mx) {
  return floor(random() * (mx - mn + 1)) + min;
}

/**
 * Retry behaviour wrapper for a function with callback.
 * The function that is passed in has to have a handler callback function as its parameter to handle error/results.
 * @param {function} func Function to wrap with retry mechanism
 * @param {number} max_retries Max number of retry attempts
 * @param {number} inc_backoff_duration Base backoff duration of each retry attempt that is incremental
 * @param {number} max_backoff Max backoff duration of each retry attempt
 * @param {string} log_prefix Optional error message prefix to add to the logs during retry attempts
 * @param {function} cb Callback function
 * @returns {undefined}
 */
export function executeWithRetry(func, max_retries, inc_backoff_duration, max_backoff, log_prefix, cb) {
  let attempts = 0;
  log_prefix = log_prefix || 'Log';

  function execute() {
    attempts++;

    // Execute the funtion that was passed in with a callback handler function as a parameter
    func(function (err, res) {
      if (!err) {
        if (attempts !== 1) {
          console.info(`[RETRY] ${log_prefix} | [${attempts}] | Finally succeeded`);
        }
        return cb(null, res);
      } else {
        // If there was an error, try again if we have not exceeded max retries
        if (attempts === max_retries) {
          // Return the error if we have exceeded max retries
          console.error(`[RETRY] ${log_prefix} | [Retries exhausted] | ${err}`);
          return cb(err);
        }

        console.warn(`[RETRY] ${log_prefix} | [${attempts}] | ${err}`);

        // Delay before next attempt with added jitter factor to the duration
        // to reduce occasions of multiple calls happening overly close to one another
        return setTimeout(execute, min(attempts * inc_backoff_duration, max_backoff) + randomNumber(100, 300));
      }
    });
  }

  execute();
}
