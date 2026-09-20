import { GmailErrorCategory } from "@/lib/gmail/error-map";

export function parseRetryAfterMs(retryAfterValue) {
  if (!retryAfterValue) {
    return null;
  }

  const retryAfterSeconds = Number.parseInt(retryAfterValue, 10);
  return Number.isFinite(retryAfterSeconds) ? retryAfterSeconds * 1000 : null;
}

export function createGmailRetryPolicy({
  baseDelayMs = 1000,
  jitterMs = 1000,
  maxAttempts = 5,
  maxDelayMs = 64_000,
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

  function shouldRetry(error, { attemptNumber, operationMode = "idempotent" } = {}) {
    if (attemptNumber >= maxAttempts) {
      return false;
    }

    if (
      error.category === GmailErrorCategory.AUTHENTICATION_REQUIRED ||
      error.category === GmailErrorCategory.INVALID_REVOKED_CREDENTIAL ||
      error.category === GmailErrorCategory.MALFORMED_REQUEST ||
      error.category === GmailErrorCategory.PERMANENT_API_FAILURE ||
      error.category === GmailErrorCategory.QUOTA_EXHAUSTED
    ) {
      return false;
    }

    if (operationMode !== "idempotent" && error.category === GmailErrorCategory.TRANSIENT_API_FAILURE) {
      return false;
    }

    return error.category === GmailErrorCategory.RATE_LIMITED || error.category === GmailErrorCategory.TRANSIENT_API_FAILURE;
  }

  async function execute(task, { operationMode = "idempotent" } = {}) {
    let attemptNumber = 0;

    while (true) {
      attemptNumber += 1;

      try {
        return await task({ attemptNumber });
      } catch (error) {
        if (!shouldRetry(error, { attemptNumber, operationMode })) {
          throw error;
        }

        const delayMs = computeDelayMs(attemptNumber, error.retryAfterMs);
        await sleep(delayMs);
      }
    }
  }

  return {
    computeDelayMs,
    execute,
    shouldRetry,
  };
}