import https from "node:https";

import {
  RFC8058_ONE_CLICK_TOKEN,
  UNSUBSCRIBE_EXECUTION_RESULT_STATUSES,
  UNSUBSCRIBE_OPERATION_STATUSES,
  UNSUBSCRIBE_OPERATION_TYPES,
} from "@/lib/unsubscribe/constants";
import {
  resolveAndValidateExecutionTarget,
} from "@/lib/unsubscribe/network-security";
import {
  createUnsubscribeRetryPolicy,
  parseRetryAfterMs,
} from "@/lib/unsubscribe/retry-policy";

const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);
const MANUAL_RESPONSE_PATTERNS = [
  /captcha/i,
  /log\s*in/i,
  /sign\s*in/i,
  /verify\s+you\s+are\s+human/i,
  /human\s+verification/i,
];

function createTransportError(message, extras = {}) {
  const error = new Error(message);
  Object.assign(error, extras);
  return error;
}

function isManualInteractionResponse({ bodyPreview, headers, statusCode }) {
  if ([401, 403, 407].includes(statusCode)) {
    return true;
  }

  const contentType = String(headers["content-type"] || "").toLowerCase();

  if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
    return false;
  }

  return MANUAL_RESPONSE_PATTERNS.some((pattern) => pattern.test(bodyPreview));
}

function normalizeHeaders(headers) {
  const normalizedHeaders = {};

  for (const [key, value] of Object.entries(headers || {})) {
    normalizedHeaders[key.toLowerCase()] = value;
  }

  return normalizedHeaders;
}

function buildResult(operation, status, extras = {}) {
  return {
    completedAt: Date.now(),
    operationId: operation.id,
    operationType: operation.type,
    status,
    ...extras,
  };
}

function createTimeoutController(timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(createTransportError("unsubscribe_request_timeout", {
      code: "unsubscribe_request_timeout",
      retryable: true,
    }));
  }, timeoutMs);

  return {
    clear() {
      clearTimeout(timeoutId);
    },
    signal: controller.signal,
  };
}

async function runWithOperationTimeout(task, timeoutMs) {
  const timeoutController = createTimeoutController(timeoutMs);
  const timeoutPromise = new Promise((_, reject) => {
    timeoutController.signal.addEventListener("abort", () => {
      reject(timeoutController.signal.reason || createTransportError("unsubscribe_request_timeout", {
        code: "unsubscribe_request_timeout",
        retryable: true,
      }));
    }, { once: true });
  });

  try {
    return await Promise.race([
      task({ signal: timeoutController.signal }),
      timeoutPromise,
    ]);
  } finally {
    timeoutController.clear();
  }
}

export function defaultSendPinnedHttpsRequest({
  signal,
  body,
  headers,
  maxResponseBytes,
  method,
  resolvedTarget,
  timeoutMs,
}) {
  return new Promise((resolve, reject) => {
    let bodyBytes = 0;
    const bodyChunks = [];
    let completed = false;
    let settled = false;

    function rejectOnce(error) {
      if (settled) {
        return;
      }

      settled = true;
      reject(error);
    }

    function resolveOnce(value) {
      if (settled) {
        return;
      }

      settled = true;
      resolve(value);
    }

    if (signal?.aborted) {
      rejectOnce(signal.reason || createTransportError("unsubscribe_request_timeout", {
        code: "unsubscribe_request_timeout",
        retryable: true,
      }));
      return;
    }

    const request = https.request({
      agent: false,
      headers,
      hostname: resolvedTarget.hostname,
      lookup(hostname, options, callback) {
        if (hostname !== resolvedTarget.hostname) {
          callback(createTransportError("unsubscribe_dns_rebind_blocked", {
            code: "unsubscribe_dns_rebind_blocked",
          }));
          return;
        }

        callback(null, resolvedTarget.selectedAddress.address, resolvedTarget.selectedAddress.family);
      },
      method,
      path: `${resolvedTarget.url.pathname}${resolvedTarget.url.search}`,
      port: Number.parseInt(resolvedTarget.port, 10),
      protocol: "https:",
      servername: resolvedTarget.hostname,
    }, (response) => {
      const normalizedHeaders = normalizeHeaders(response.headers);

      response.on("data", (chunk) => {
        bodyBytes += chunk.length;

        if (bodyBytes > maxResponseBytes) {
          response.destroy(createTransportError("unsubscribe_response_too_large", {
            code: "unsubscribe_response_too_large",
          }));
          return;
        }

        bodyChunks.push(chunk);
      });

      response.on("end", () => {
        completed = true;
        resolveOnce({
          bodyPreview: Buffer.concat(bodyChunks).toString("utf8"),
          headers: normalizedHeaders,
          statusCode: response.statusCode || 0,
        });
      });

      response.on("error", rejectOnce);
    });

    const abortRequest = () => {
      request.destroy(signal.reason || createTransportError("unsubscribe_request_timeout", {
        code: "unsubscribe_request_timeout",
        retryable: true,
      }));
    };

    signal?.addEventListener("abort", abortRequest, { once: true });

    request.setTimeout(timeoutMs, () => {
      request.destroy(createTransportError("unsubscribe_request_timeout", {
        code: "unsubscribe_request_timeout",
        retryable: true,
      }));
    });

    request.on("error", (error) => {
      if (completed) {
        return;
      }

      rejectOnce(error);
    });

    request.on("close", () => {
      signal?.removeEventListener("abort", abortRequest);
    });

    request.write(body);
    request.end();
  });
}

function classifyTransportError(operation, error) {
  if (error?.code === "unsubscribe_target_unsafe_ip" || error?.code === "unsubscribe_target_unsafe_hostname") {
    return buildResult(operation, UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.UNSAFE_TARGET);
  }

  if (
    error?.code === "unsubscribe_target_requires_https" ||
    error?.code === "unsubscribe_target_unsupported_port" ||
    error?.code === "unsubscribe_target_embedded_credentials" ||
    error?.code === "unsubscribe_target_malformed"
  ) {
    return buildResult(operation, UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.UNSAFE_TARGET);
  }

  if (error?.code === "unsubscribe_dns_resolution_failed") {
    return buildResult(
      operation,
      error.retryable
        ? UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.FAILED_RETRYABLE
        : UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.FAILED_PERMANENT,
    );
  }

  if (
    error?.code === "unsubscribe_dns_resolution_empty" ||
    error?.code === "unsubscribe_dns_rebind_blocked"
  ) {
    return buildResult(operation, UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.UNSAFE_TARGET);
  }

  if (error?.code === "unsubscribe_response_too_large") {
    return buildResult(operation, UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.FAILED_PERMANENT);
  }

  if (error?.code === "unsubscribe_request_timeout" || error?.retryable) {
    return buildResult(operation, UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.FAILED_RETRYABLE, {
      retryAfterMs: error?.retryAfterMs ?? null,
    });
  }

  return buildResult(operation, UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.FAILED_PERMANENT);
}

export function createUnsubscribeTransport({
  maxRedirects = 2,
  maxResponseBytes = 16 * 1024,
  requestTimeoutMs = 5_000,
  resolveTarget = resolveAndValidateExecutionTarget,
  retryPolicy = createUnsubscribeRetryPolicy(),
  sendPinnedHttpsRequest = defaultSendPinnedHttpsRequest,
} = {}) {
  async function sendOperationRequest(operation, target, redirectCount = 0) {
    const response = await runWithOperationTimeout(async ({ signal }) => {
      const resolvedTarget = await resolveTarget(target);
      const body = RFC8058_ONE_CLICK_TOKEN;
      const requestResponse = await sendPinnedHttpsRequest({
        signal,
        body,
        headers: {
          "content-length": Buffer.byteLength(body),
          "content-type": "application/x-www-form-urlencoded",
        },
        maxResponseBytes,
        method: "POST",
        resolvedTarget,
        timeoutMs: requestTimeoutMs,
      });

      return {
        requestResponse,
        resolvedTarget,
      };
    }, requestTimeoutMs);

    const { requestResponse, resolvedTarget } = response;

    if (requestResponse.statusCode >= 200 && requestResponse.statusCode < 300) {
      if (isManualInteractionResponse(requestResponse)) {
        return buildResult(operation, UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.MANUAL_ACTION_REQUIRED, {
          httpStatus: requestResponse.statusCode,
        });
      }

      return buildResult(operation, UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.SUCCESS, {
        httpStatus: requestResponse.statusCode,
      });
    }

    if (REDIRECT_STATUS_CODES.has(requestResponse.statusCode)) {
      const locationHeader = requestResponse.headers.location;

      if (!locationHeader) {
        return buildResult(operation, UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.FAILED_PERMANENT, {
          httpStatus: requestResponse.statusCode,
        });
      }

      if (redirectCount >= maxRedirects) {
        return buildResult(operation, UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.FAILED_PERMANENT, {
          httpStatus: requestResponse.statusCode,
        });
      }

      if (requestResponse.statusCode !== 307 && requestResponse.statusCode !== 308) {
        return buildResult(operation, UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.MANUAL_ACTION_REQUIRED, {
          httpStatus: requestResponse.statusCode,
        });
      }

      const nextTarget = new URL(locationHeader, resolvedTarget.url).toString();
      return sendOperationRequest(operation, nextTarget, redirectCount + 1);
    }

    if (requestResponse.statusCode === 429) {
      throw createTransportError("unsubscribe_rate_limited", {
        code: "unsubscribe_rate_limited",
        retryAfterMs: parseRetryAfterMs(requestResponse.headers["retry-after"]),
        retryable: true,
        status: requestResponse.statusCode,
      });
    }

    if (requestResponse.statusCode >= 500) {
      throw createTransportError("unsubscribe_server_failure", {
        code: "unsubscribe_server_failure",
        retryable: true,
        status: requestResponse.statusCode,
      });
    }

    if (isManualInteractionResponse(requestResponse)) {
      return buildResult(operation, UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.MANUAL_ACTION_REQUIRED, {
        httpStatus: requestResponse.statusCode,
      });
    }

    return buildResult(operation, UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.FAILED_PERMANENT, {
      httpStatus: requestResponse.statusCode,
    });
  }

  async function executeOperation(operation) {
    if (!operation || operation.type !== UNSUBSCRIBE_OPERATION_TYPES.RFC8058_ONE_CLICK) {
      return buildResult(
        operation || { id: "unknown", type: "UNKNOWN" },
        UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.MANUAL_ACTION_REQUIRED,
      );
    }

    if (operation.status !== UNSUBSCRIBE_OPERATION_STATUSES.AUTOMATIC) {
      return buildResult(operation, UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.MANUAL_ACTION_REQUIRED);
    }

    try {
      return await retryPolicy.execute(() => sendOperationRequest(operation, operation.target));
    } catch (error) {
      return classifyTransportError(operation, error);
    }
  }

  return {
    executeOperation,
  };
}