function createMonthKey(timestamp) {
  const date = new Date(timestamp);
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");

  return `${date.getUTCFullYear()}-${month}`;
}

function buildBucketKey(accountKey, monthKey) {
  return `${accountKey}:${monthKey}`;
}

function createUsageBucket(accountKey, monthKey) {
  return {
    accountKey,
    monthKey,
    reservedOperationIds: new Set(),
    successfulOperationIds: new Set(),
  };
}

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

export function createUnsubscribeUsageStore({ now = () => Date.now() } = {}) {
  const usageBucketByKey = new Map();

  function getUsageBucket(accountKey) {
    const monthKey = createMonthKey(now());
    const bucketKey = buildBucketKey(accountKey, monthKey);

    if (!usageBucketByKey.has(bucketKey)) {
      usageBucketByKey.set(bucketKey, createUsageBucket(accountKey, monthKey));
    }

    return usageBucketByKey.get(bucketKey);
  }

  function getUsage({ accountKey, monthlyLimit }) {
    const bucket = getUsageBucket(accountKey);
    const successfulCount = bucket.successfulOperationIds.size;

    return {
      accountKey,
      monthKey: bucket.monthKey,
      monthlyLimit,
      remainingCount: Math.max(0, monthlyLimit - successfulCount),
      state: successfulCount >= monthlyLimit
        ? AUTOMATIC_UNSUBSCRIBE_USAGE_STATES.LIMIT_REACHED
        : AUTOMATIC_UNSUBSCRIBE_USAGE_STATES.AVAILABLE,
      successfulCount,
    };
  }

  function reserveOperation({ accountKey, monthlyLimit, operationId }) {
    const bucket = getUsageBucket(accountKey);

    if (bucket.successfulOperationIds.has(operationId)) {
      return {
        status: AUTOMATIC_UNSUBSCRIBE_RESERVATION_STATUSES.ALREADY_COUNTED,
        usage: getUsage({ accountKey, monthlyLimit }),
      };
    }

    if (bucket.reservedOperationIds.has(operationId)) {
      return {
        status: AUTOMATIC_UNSUBSCRIBE_RESERVATION_STATUSES.ALREADY_RESERVED,
        usage: getUsage({ accountKey, monthlyLimit }),
      };
    }

    if (bucket.successfulOperationIds.size + bucket.reservedOperationIds.size >= monthlyLimit) {
      return {
        status: AUTOMATIC_UNSUBSCRIBE_RESERVATION_STATUSES.LIMIT_REACHED,
        usage: getUsage({ accountKey, monthlyLimit }),
      };
    }

    bucket.reservedOperationIds.add(operationId);

    return {
      status: AUTOMATIC_UNSUBSCRIBE_RESERVATION_STATUSES.RESERVED,
      usage: getUsage({ accountKey, monthlyLimit }),
    };
  }

  function finalizeOperation({ accountKey, monthlyLimit, operationId, success }) {
    const bucket = getUsageBucket(accountKey);
    bucket.reservedOperationIds.delete(operationId);

    if (success) {
      bucket.successfulOperationIds.add(operationId);
    }

    return getUsage({ accountKey, monthlyLimit });
  }

  return {
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