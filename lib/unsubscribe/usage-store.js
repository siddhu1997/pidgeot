export const AUTOMATIC_UNSUBSCRIBE_USAGE_STATES = {
  AVAILABLE: "AVAILABLE",
  LIMIT_REACHED: "LIMIT_REACHED",
};

export const AUTOMATIC_UNSUBSCRIBE_RESERVATION_STATUSES = {
  ALREADY_COUNTED: "ALREADY_COUNTED",
  ALREADY_RESERVED: "ALREADY_RESERVED",
  LIMIT_REACHED: "LIMIT_REACHED",
  RESERVED: "RESERVED",
};

function createUsageBucket(sessionId) {
  return {
    reservedOperationIds: new Set(),
    sessionId,
    successfulOperationIds: new Set(),
  };
}

function buildUsageSnapshot(sessionId, limit, successfulCount) {
  return {
    limit,
    remainingCount: Math.max(0, limit - successfulCount),
    sessionId: sessionId || null,
    state: successfulCount >= limit
      ? AUTOMATIC_UNSUBSCRIBE_USAGE_STATES.LIMIT_REACHED
      : AUTOMATIC_UNSUBSCRIBE_USAGE_STATES.AVAILABLE,
    successfulCount,
  };
}

export function createUnsubscribeUsageStore() {
  const usageBucketBySessionId = new Map();
  const discardedSessionIds = new Set();

  function getUsageBucket(sessionId) {
    if (!sessionId || discardedSessionIds.has(sessionId)) {
      return null;
    }

    if (!usageBucketBySessionId.has(sessionId)) {
      usageBucketBySessionId.set(sessionId, createUsageBucket(sessionId));
    }

    return usageBucketBySessionId.get(sessionId);
  }

  function getUsage({ limit, sessionId }) {
    if (!sessionId) {
      return buildUsageSnapshot(null, limit, 0);
    }

    if (discardedSessionIds.has(sessionId)) {
      return {
        limit,
        remainingCount: 0,
        sessionId,
        state: AUTOMATIC_UNSUBSCRIBE_USAGE_STATES.LIMIT_REACHED,
        successfulCount: 0,
      };
    }

    const bucket = getUsageBucket(sessionId);
    return buildUsageSnapshot(sessionId, limit, bucket.successfulOperationIds.size);
  }

  function reserveOperation({ limit, operationId, sessionId }) {
    const bucket = getUsageBucket(sessionId);

    if (!bucket) {
      return {
        status: AUTOMATIC_UNSUBSCRIBE_RESERVATION_STATUSES.LIMIT_REACHED,
        usage: getUsage({ limit, sessionId }),
      };
    }

    if (bucket.successfulOperationIds.has(operationId)) {
      return {
        status: AUTOMATIC_UNSUBSCRIBE_RESERVATION_STATUSES.ALREADY_COUNTED,
        usage: getUsage({ limit, sessionId }),
      };
    }

    if (bucket.reservedOperationIds.has(operationId)) {
      return {
        status: AUTOMATIC_UNSUBSCRIBE_RESERVATION_STATUSES.ALREADY_RESERVED,
        usage: getUsage({ limit, sessionId }),
      };
    }

    if (bucket.successfulOperationIds.size + bucket.reservedOperationIds.size >= limit) {
      return {
        status: AUTOMATIC_UNSUBSCRIBE_RESERVATION_STATUSES.LIMIT_REACHED,
        usage: getUsage({ limit, sessionId }),
      };
    }

    bucket.reservedOperationIds.add(operationId);

    return {
      status: AUTOMATIC_UNSUBSCRIBE_RESERVATION_STATUSES.RESERVED,
      usage: getUsage({ limit, sessionId }),
    };
  }

  function finalizeOperation({ limit, operationId, sessionId, success }) {
    const bucket = usageBucketBySessionId.get(sessionId);

    if (!bucket) {
      return getUsage({ limit, sessionId });
    }

    bucket.reservedOperationIds.delete(operationId);

    if (success) {
      bucket.successfulOperationIds.add(operationId);
    }

    return getUsage({ limit, sessionId });
  }

  function discardUsage(sessionId) {
    if (!sessionId) {
      return;
    }

    usageBucketBySessionId.delete(sessionId);
    discardedSessionIds.add(sessionId);
  }

  return {
    discardUsage,
    finalizeOperation,
    getUsage,
    reserveOperation,
  };
}

let cachedStore;

export function getUnsubscribeUsageStore() {
  if (cachedStore) {
    return cachedStore;
  }

  cachedStore = createUnsubscribeUsageStore();
  return cachedStore;
}
