import { CLEANUP_EXECUTION_RESULT_STATUSES } from "@/lib/cleanup/constants";

function isStickyFailureStatus(status) {
  return status === CLEANUP_EXECUTION_RESULT_STATUSES.FAILED_PERMANENT;
}

export function createCleanupExecutionStore({ now = () => Date.now() } = {}) {
  const resultsBySessionMessageKey = new Map();
  const inFlightBySessionMessageKey = new Map();

  function buildMessageKey(sessionId, messageId) {
    return `${sessionId}:${messageId}`;
  }

  function getResult({ messageId, sessionId }) {
    return resultsBySessionMessageKey.get(buildMessageKey(sessionId, messageId)) || null;
  }

  function setResult({ messageId, result, sessionId }) {
    resultsBySessionMessageKey.set(buildMessageKey(sessionId, messageId), result);
    return result;
  }

  async function runMessageMutation({ messageId, runner, sessionId }) {
    const messageKey = buildMessageKey(sessionId, messageId);
    const existingResult = getResult({ messageId, sessionId });

    if (existingResult?.status === CLEANUP_EXECUTION_RESULT_STATUSES.SUCCESS) {
      return {
        ...existingResult,
        status: CLEANUP_EXECUTION_RESULT_STATUSES.ALREADY_COMPLETED,
      };
    }

    if (existingResult && isStickyFailureStatus(existingResult.status)) {
      return existingResult;
    }

    if (inFlightBySessionMessageKey.has(messageKey)) {
      return inFlightBySessionMessageKey.get(messageKey);
    }

    const executionPromise = (async () => {
      try {
        const result = await runner();
        setResult({ messageId, result, sessionId });
        return result;
      } finally {
        inFlightBySessionMessageKey.delete(messageKey);
      }
    })();

    inFlightBySessionMessageKey.set(messageKey, executionPromise);
    return executionPromise;
  }

  return {
    getResult,
    runMessageMutation,
    setResult,
  };
}

let cachedStore;

export function getCleanupExecutionStore() {
  if (cachedStore) {
    return cachedStore;
  }

  cachedStore = createCleanupExecutionStore();
  return cachedStore;
}