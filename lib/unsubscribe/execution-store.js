import { UNSUBSCRIBE_EXECUTION_RESULT_STATUSES } from "@/lib/unsubscribe/constants";

function isNonRetryableResultStatus(status) {
  return status === UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.FAILED_PERMANENT ||
    status === UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.MANUAL_ACTION_REQUIRED ||
    status === UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.UNSAFE_TARGET;
}

export function createUnsubscribeExecutionStore({ now = () => Date.now() } = {}) {
  const resultsBySessionOperationKey = new Map();
  const inFlightBySessionOperationKey = new Map();
  const hostCooldownBySessionHostKey = new Map();

  function buildOperationKey(sessionId, operationId) {
    return `${sessionId}:${operationId}`;
  }

  function buildHostKey(sessionId, host) {
    return `${sessionId}:${host}`;
  }

  function getResult({ operationId, sessionId }) {
    return resultsBySessionOperationKey.get(buildOperationKey(sessionId, operationId)) || null;
  }

  function setResult({ operationId, result, sessionId }) {
    resultsBySessionOperationKey.set(buildOperationKey(sessionId, operationId), result);
    return result;
  }

  function getHostCooldown({ host, sessionId }) {
    const hostKey = buildHostKey(sessionId, host);
    const cooldown = hostCooldownBySessionHostKey.get(hostKey) || null;

    if (!cooldown) {
      return null;
    }

    if (cooldown <= now()) {
      hostCooldownBySessionHostKey.delete(hostKey);
      return null;
    }

    return cooldown;
  }

  function setHostCooldown({ host, retryAfterMs, sessionId }) {
    if (!host || retryAfterMs == null) {
      return null;
    }

    const cooldownUntil = now() + retryAfterMs;
    hostCooldownBySessionHostKey.set(buildHostKey(sessionId, host), cooldownUntil);
    return cooldownUntil;
  }

  function clearSession(sessionId) {
    const sessionPrefix = `${sessionId}:`;

    for (const key of resultsBySessionOperationKey.keys()) {
      if (key.startsWith(sessionPrefix)) {
        resultsBySessionOperationKey.delete(key);
      }
    }

    for (const key of inFlightBySessionOperationKey.keys()) {
      if (key.startsWith(sessionPrefix)) {
        inFlightBySessionOperationKey.delete(key);
      }
    }

    for (const key of hostCooldownBySessionHostKey.keys()) {
      if (key.startsWith(sessionPrefix)) {
        hostCooldownBySessionHostKey.delete(key);
      }
    }
  }

  async function runOperation({ host, operationId, runner, sessionId }) {
    const operationKey = buildOperationKey(sessionId, operationId);
    const existingResult = getResult({ operationId, sessionId });

    if (existingResult?.status === UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.SUCCESS) {
      return {
        ...existingResult,
        status: UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.ALREADY_COMPLETED,
      };
    }

    if (existingResult && isNonRetryableResultStatus(existingResult.status)) {
      return existingResult;
    }

    const currentHostCooldown = getHostCooldown({ host, sessionId });

    if (currentHostCooldown) {
      return {
        completedAt: now(),
        operationId,
        retryAfterMs: Math.max(0, currentHostCooldown - now()),
        status: UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.FAILED_RETRYABLE,
      };
    }

    if (inFlightBySessionOperationKey.has(operationKey)) {
      return inFlightBySessionOperationKey.get(operationKey);
    }

    const executionPromise = (async () => {
      try {
        const result = await runner();

        if (result.retryAfterMs != null) {
          setHostCooldown({ host, retryAfterMs: result.retryAfterMs, sessionId });
        }

        setResult({ operationId, result, sessionId });
        return result;
      } finally {
        inFlightBySessionOperationKey.delete(operationKey);
      }
    })();

    inFlightBySessionOperationKey.set(operationKey, executionPromise);
    return executionPromise;
  }

  return {
    clearSession,
    getHostCooldown,
    getResult,
    runOperation,
    setHostCooldown,
    setResult,
  };
}

let cachedStore;

export function getUnsubscribeExecutionStore() {
  if (cachedStore) {
    return cachedStore;
  }

  cachedStore = createUnsubscribeExecutionStore();
  return cachedStore;
}