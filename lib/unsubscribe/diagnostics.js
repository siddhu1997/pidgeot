import {
  UNSUBSCRIBE_EXECUTION_RESULT_STATUSES,
  UNSUBSCRIBE_FAILURE_CATEGORIES,
  UNSUBSCRIBE_DLQ_BODY_EXCERPT_LIMIT,
} from "@/lib/unsubscribe/constants";

const CONNECTION_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ECONNABORTED",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EPIPE",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
]);

const DNS_ERROR_CODES = new Set([
  "EAI_AGAIN",
  "ENOTFOUND",
  "unsubscribe_dns_resolution_failed",
]);

const TLS_ERROR_CODES = new Set([
  "CERT_HAS_EXPIRED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "ERR_TLS_HANDSHAKE_TIMEOUT",
  "EPROTO",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
]);

const SECURITY_ERROR_CODES = new Set([
  "unsubscribe_dns_rebind_blocked",
  "unsubscribe_dns_resolution_empty",
  "unsubscribe_target_embedded_credentials",
  "unsubscribe_target_malformed",
  "unsubscribe_target_requires_https",
  "unsubscribe_target_unsafe_hostname",
  "unsubscribe_target_unsafe_ip",
  "unsubscribe_target_unsupported_port",
]);

const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);

export function sanitizeUnsubscribeTarget(target) {
  if (typeof target !== "string" || !target) {
    return {
      host: null,
      path: null,
      port: null,
      scheme: null,
    };
  }

  try {
    const url = new URL(target);

    return {
      host: String(url.hostname || "").toLowerCase().replace(/^\[|\]$/g, "") || null,
      path: url.pathname || "/",
      port: url.port || null,
      scheme: (url.protocol || "").replace(/:$/, "") || null,
    };
  } catch {
    return {
      host: null,
      path: null,
      port: null,
      scheme: null,
    };
  }
}

export function excerptResponseBody(value, limit = UNSUBSCRIBE_DLQ_BODY_EXCERPT_LIMIT) {
  if (typeof value !== "string" || !value) {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return null;
  }

  return normalized.length > limit ? `${normalized.slice(0, limit)}…` : normalized;
}

export function isAutomaticUnsubscribeFailureStatus(status) {
  return status === UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.FAILED_RETRYABLE
    || status === UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.FAILED_PERMANENT
    || status === UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.UNSAFE_TARGET
    || status === UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.MANUAL_ACTION_REQUIRED;
}

export function classifyUnsubscribeFailure({ error = null, httpStatus = null, status = null } = {}) {
  const errorCode = typeof error?.code === "string" ? error.code : null;
  const resolvedStatus = Number.isInteger(httpStatus) ? httpStatus : (
    Number.isInteger(error?.status) ? error.status : null
  );

  if (errorCode === "unsubscribe_request_timeout" || error?.name === "AbortError") {
    return UNSUBSCRIBE_FAILURE_CATEGORIES.TIMEOUT;
  }

  if (errorCode === "unsubscribe_response_too_large") {
    return UNSUBSCRIBE_FAILURE_CATEGORIES.INVALID_RESPONSE;
  }

  if (SECURITY_ERROR_CODES.has(errorCode) || status === UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.UNSAFE_TARGET) {
    return UNSUBSCRIBE_FAILURE_CATEGORIES.SECURITY_REJECTED;
  }

  if (DNS_ERROR_CODES.has(errorCode)) {
    return UNSUBSCRIBE_FAILURE_CATEGORIES.DNS_FAILURE;
  }

  if (TLS_ERROR_CODES.has(errorCode) || String(errorCode || "").startsWith("ERR_TLS_")) {
    return UNSUBSCRIBE_FAILURE_CATEGORIES.TLS_FAILURE;
  }

  if (CONNECTION_ERROR_CODES.has(errorCode)) {
    return UNSUBSCRIBE_FAILURE_CATEGORIES.CONNECTION_FAILURE;
  }

  if (status === UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.MANUAL_ACTION_REQUIRED) {
    if (REDIRECT_STATUS_CODES.has(resolvedStatus)) {
      return UNSUBSCRIBE_FAILURE_CATEGORIES.REDIRECT_REJECTED;
    }

    return UNSUBSCRIBE_FAILURE_CATEGORIES.UNSUPPORTED_RESPONSE;
  }

  if (REDIRECT_STATUS_CODES.has(resolvedStatus) || errorCode === "unsubscribe_too_many_redirects") {
    return UNSUBSCRIBE_FAILURE_CATEGORIES.REDIRECT_REJECTED;
  }

  if (Number.isInteger(resolvedStatus) && resolvedStatus >= 500) {
    return UNSUBSCRIBE_FAILURE_CATEGORIES.HTTP_5XX;
  }

  if (Number.isInteger(resolvedStatus) && resolvedStatus >= 400) {
    return UNSUBSCRIBE_FAILURE_CATEGORIES.HTTP_4XX;
  }

  return UNSUBSCRIBE_FAILURE_CATEGORIES.UNKNOWN;
}

export function buildUnsubscribeFailureDiagnostics({
  attemptNumber = 1,
  durationMs = null,
  error = null,
  httpStatus = null,
  operation = null,
  redirect = null,
  request = null,
  response = null,
  status = null,
} = {}) {
  const resolvedHttpStatus = Number.isInteger(httpStatus) ? httpStatus : (
    Number.isInteger(error?.status) ? error.status : null
  );
  const category = classifyUnsubscribeFailure({
    error,
    httpStatus: resolvedHttpStatus,
    status,
  });

  return {
    attemptNumber: Number.isInteger(attemptNumber) && attemptNumber > 0 ? attemptNumber : 1,
    durationMs: Number.isFinite(durationMs) ? Math.max(0, Math.round(durationMs)) : null,
    failureCategory: category,
    httpStatus: resolvedHttpStatus,
    redirect: redirect
      ? {
        locationHost: redirect.locationHost || null,
        status: Number.isInteger(redirect.status) ? redirect.status : resolvedHttpStatus,
      }
      : null,
    request: {
      contentType: request?.contentType || "application/x-www-form-urlencoded",
      method: request?.method || "POST",
    },
    response: response
      ? {
        bodyExcerpt: excerptResponseBody(response.bodyPreview || response.bodyExcerpt),
        contentType: typeof response.contentType === "string" ? response.contentType.slice(0, 120) : null,
      }
      : null,
    target: sanitizeUnsubscribeTarget(operation?.target),
    timeout: category === UNSUBSCRIBE_FAILURE_CATEGORIES.TIMEOUT,
    transportCode: typeof error?.code === "string" ? error.code : null,
  };
}
