export const GmailErrorCategory = {
  AUTHENTICATION_REQUIRED: "AUTHENTICATION_REQUIRED",
  INVALID_REVOKED_CREDENTIAL: "INVALID_REVOKED_CREDENTIAL",
  MALFORMED_REQUEST: "MALFORMED_REQUEST",
  PERMANENT_API_FAILURE: "PERMANENT_API_FAILURE",
  QUOTA_EXHAUSTED: "QUOTA_EXHAUSTED",
  RATE_LIMITED: "RATE_LIMITED",
  TRANSIENT_API_FAILURE: "TRANSIENT_API_FAILURE",
  UNKNOWN_GMAIL_ERROR: "UNKNOWN_GMAIL_ERROR",
};

export class GmailAppError extends Error {
  constructor({ category, message, retryAfterMs = null, retryable = false, status = null }) {
    super(message);
    this.category = category;
    this.name = "GmailAppError";
    this.retryAfterMs = retryAfterMs;
    this.retryable = retryable;
    this.status = status;
  }
}

function extractErrorStatus(error) {
  return error?.status || error?.response?.status || error?.code || null;
}

function extractErrorReason(error) {
  const reason = error?.response?.data?.error?.errors?.[0]?.reason;
  const topLevelError = error?.response?.data?.error;

  if (typeof topLevelError === "string") {
    return topLevelError;
  }

  return reason || error?.message || "unknown";
}

function parseRetryAfterMs(error) {
  const retryAfterHeader = error?.response?.headers?.get?.("retry-after") || error?.response?.headers?.["retry-after"];

  if (!retryAfterHeader) {
    return null;
  }

  const retryAfterSeconds = Number.parseInt(retryAfterHeader, 10);
  return Number.isFinite(retryAfterSeconds) ? retryAfterSeconds * 1000 : null;
}

export function mapGmailError(error) {
  if (error instanceof GmailAppError) {
    return error;
  }

  const status = extractErrorStatus(error);
  const reason = String(extractErrorReason(error));
  const retryAfterMs = parseRetryAfterMs(error);

  if (reason === "gmail_reauth_required" || reason === "session_not_found") {
    return new GmailAppError({
      category: GmailErrorCategory.AUTHENTICATION_REQUIRED,
      message: "Gmail authentication is required before processing can continue.",
      status,
    });
  }

  if (reason === "invalid_grant" || reason === "invalid_token" || status === 401) {
    return new GmailAppError({
      category: GmailErrorCategory.INVALID_REVOKED_CREDENTIAL,
      message: "The Gmail credential is no longer valid and re-authentication is required.",
      status,
    });
  }

  if (status === 429 || reason === "rateLimitExceeded" || reason === "userRateLimitExceeded") {
    return new GmailAppError({
      category: GmailErrorCategory.RATE_LIMITED,
      message: "Gmail is rate limiting the current operation.",
      retryAfterMs,
      retryable: true,
      status,
    });
  }

  if (
    reason === "quotaExceeded" ||
    reason === "dailyLimitExceeded" ||
    reason === "dailyLimitExceededUnreg"
  ) {
    return new GmailAppError({
      category: GmailErrorCategory.QUOTA_EXHAUSTED,
      message: "The Gmail quota budget has been exhausted for the current project or user.",
      retryAfterMs,
      status,
    });
  }

  if (status === 400 || status === 404) {
    return new GmailAppError({
      category: GmailErrorCategory.MALFORMED_REQUEST,
      message: "The Gmail request was malformed or referenced unavailable mailbox data.",
      status,
    });
  }

  if (status === 500 || status === 502 || status === 503 || status === 504) {
    return new GmailAppError({
      category: GmailErrorCategory.TRANSIENT_API_FAILURE,
      message: "Gmail returned a transient server failure.",
      retryAfterMs,
      retryable: true,
      status,
    });
  }

  if (status) {
    return new GmailAppError({
      category: GmailErrorCategory.PERMANENT_API_FAILURE,
      message: "The Gmail operation failed with a non-retryable API error.",
      status,
    });
  }

  return new GmailAppError({
    category: GmailErrorCategory.UNKNOWN_GMAIL_ERROR,
    message: "An unknown Gmail error occurred.",
    retryAfterMs,
  });
}