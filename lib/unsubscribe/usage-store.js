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

function createUsageBucket(leaseId) {
  return {
    leaseId,
    reservedOperationIds: new Set(),
    successfulOperationIds: new Set(),
  };
}

function buildUsageSnapshot(leaseId, limit, successfulCount) {
  return {
    leaseId: leaseId || null,
    limit,
    remainingCount: Math.max(0, limit - successfulCount),
    state: successfulCount >= limit
      ? AUTOMATIC_UNSUBSCRIBE_USAGE_STATES.LIMIT_REACHED
      : AUTOMATIC_UNSUBSCRIBE_USAGE_STATES.AVAILABLE,
    successfulCount,
  };
}

export function createUnsubscribeUsageStore() {
  const usageBucketByLeaseId = new Map();
  const discardedLeaseIds = new Set();

  function getUsageBucket(leaseId) {
    if (!leaseId || discardedLeaseIds.has(leaseId)) {
      return null;
    }

    if (!usageBucketByLeaseId.has(leaseId)) {
      usageBucketByLeaseId.set(leaseId, createUsageBucket(leaseId));
    }

    return usageBucketByLeaseId.get(leaseId);
  }

  function getUsage({ leaseId, limit }) {
    if (!leaseId) {
      return buildUsageSnapshot(null, limit, 0);
    }

    if (discardedLeaseIds.has(leaseId)) {
      return {
        leaseId,
        limit,
        remainingCount: 0,
        state: AUTOMATIC_UNSUBSCRIBE_USAGE_STATES.LIMIT_REACHED,
        successfulCount: 0,
      };
    }

    const bucket = getUsageBucket(leaseId);
    return buildUsageSnapshot(leaseId, limit, bucket.successfulOperationIds.size);
  }

  function reserveOperation({ leaseId, limit, operationId }) {
    const bucket = getUsageBucket(leaseId);

    if (!bucket) {
      return {
        status: AUTOMATIC_UNSUBSCRIBE_RESERVATION_STATUSES.LIMIT_REACHED,
        usage: getUsage({ leaseId, limit }),
      };
    }

    if (bucket.successfulOperationIds.has(operationId)) {
      return {
        status: AUTOMATIC_UNSUBSCRIBE_RESERVATION_STATUSES.ALREADY_COUNTED,
        usage: getUsage({ leaseId, limit }),
      };
    }

    if (bucket.reservedOperationIds.has(operationId)) {
      return {
        status: AUTOMATIC_UNSUBSCRIBE_RESERVATION_STATUSES.ALREADY_RESERVED,
        usage: getUsage({ leaseId, limit }),
      };
    }

    if (bucket.successfulOperationIds.size + bucket.reservedOperationIds.size >= limit) {
      return {
        status: AUTOMATIC_UNSUBSCRIBE_RESERVATION_STATUSES.LIMIT_REACHED,
        usage: getUsage({ leaseId, limit }),
      };
    }

    bucket.reservedOperationIds.add(operationId);

    return {
      status: AUTOMATIC_UNSUBSCRIBE_RESERVATION_STATUSES.RESERVED,
      usage: getUsage({ leaseId, limit }),
    };
  }

  function finalizeOperation({ leaseId, limit, operationId, success }) {
    const bucket = usageBucketByLeaseId.get(leaseId);

    if (!bucket) {
      return getUsage({ leaseId, limit });
    }

    bucket.reservedOperationIds.delete(operationId);

    if (success) {
      bucket.successfulOperationIds.add(operationId);
    }

    return getUsage({ leaseId, limit });
  }

  function discardUsage(leaseId) {
    if (!leaseId) {
      return;
    }

    usageBucketByLeaseId.delete(leaseId);
    discardedLeaseIds.add(leaseId);
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
