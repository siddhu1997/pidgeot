export function parseRetryAfterMs(retryAfterValue) {
  if (!retryAfterValue) {
    return null;
  }

  const retryAfterSeconds = Number.parseInt(retryAfterValue, 10);

  if (Number.isFinite(retryAfterSeconds)) {
    return retryAfterSeconds * 1000;
  }

  const retryAfterDate = Date.parse(retryAfterValue);

  if (!Number.isFinite(retryAfterDate)) {
    return null;
  }

  return Math.max(0, retryAfterDate - Date.now());
}

export function createUnsubscribeRetryPolicy({
  baseDelayMs = 250,
  jitterMs = 100,
  maxAttempts = 2,
  maxDelayMs = 2_000,
  random = Math.random,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  function computeDelayMs(attemptNumber, retryAfterMs = null) {
    if (retryAfterMs != null) {
      return retryAfterMs;
    }

    const exponentialDelay = Math.min(baseDelayMs * (2 ** (attemptNumber - 1)), maxDelayMs);
    const jitter = Math.floor(random() * jitterMs);
    return Math.min(exponentialDelay + jitter, maxDelayMs);
  }

  function shouldRetry(error, { attemptNumber } = {}) {
    if (attemptNumber >= maxAttempts) {
      return false;
    }

    return error?.retryable === true;
  }

  async function execute(task) {
    let attemptNumber = 0;

    while (true) {
      attemptNumber += 1;

      try {
        return await task({ attemptNumber });
      } catch (error) {
        if (!shouldRetry(error, { attemptNumber })) {
          throw error;
        }

        await sleep(computeDelayMs(attemptNumber, error.retryAfterMs));
      }
    }
  }

  return {
    computeDelayMs,
    execute,
    shouldRetry,
  };
}