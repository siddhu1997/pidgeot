export const GMAIL_QUOTA_LIMITS = {
  perDayPerProject: 80_000_000,
  perMinutePerProject: 1_200_000,
  perMinutePerUserPerProject: 6_000,
};

export const GMAIL_METHOD_QUOTA_COSTS = {
  "messages.get": 20,
};

function trimWindow(entries, currentTime, windowMs) {
  return entries.filter((entry) => entry.timestamp > currentTime - windowMs);
}

function sumUnits(entries) {
  return entries.reduce((total, entry) => total + entry.units, 0);
}

export function getGmailMethodQuotaCost(methodName) {
  return GMAIL_METHOD_QUOTA_COSTS[methodName] ?? null;
}

export function createGmailQuotaPolicy({
  now = () => Date.now(),
  perMinuteProjectBudget = GMAIL_QUOTA_LIMITS.perMinutePerProject,
  perMinuteUserBudget = GMAIL_QUOTA_LIMITS.perMinutePerUserPerProject,
  windowMs = 60 * 1000,
} = {}) {
  let projectEntries = [];
  const userEntries = new Map();

  function getWindowUsage(userId) {
    const currentTime = now();
    projectEntries = trimWindow(projectEntries, currentTime, windowMs);
    const nextUserEntries = trimWindow(userEntries.get(userId) || [], currentTime, windowMs);
    userEntries.set(userId, nextUserEntries);

    return {
      projectUnits: sumUnits(projectEntries),
      userUnits: sumUnits(nextUserEntries),
    };
  }

  function canConsume({ methodName, userId = "default-user" }) {
    const units = getGmailMethodQuotaCost(methodName);

    if (units == null) {
      return {
        allowed: false,
        reason: "UNKNOWN_METHOD_COST",
        units: null,
      };
    }

    const usage = getWindowUsage(userId);

    if (usage.projectUnits + units > perMinuteProjectBudget) {
      return {
        allowed: false,
        reason: "LOCAL_PROJECT_BUDGET_EXCEEDED",
        units,
      };
    }

    if (usage.userUnits + units > perMinuteUserBudget) {
      return {
        allowed: false,
        reason: "LOCAL_USER_BUDGET_EXCEEDED",
        units,
      };
    }

    return {
      allowed: true,
      reason: null,
      units,
    };
  }

  function recordConsumption({ methodName, userId = "default-user" }) {
    const decision = canConsume({ methodName, userId });

    if (!decision.allowed) {
      return decision;
    }

    const entry = {
      timestamp: now(),
      units: decision.units,
    };

    projectEntries = [...projectEntries, entry];
    userEntries.set(userId, [...(userEntries.get(userId) || []), entry]);

    return decision;
  }

  function getUsageSnapshot(userId = "default-user") {
    const usage = getWindowUsage(userId);

    return {
      policySource: "local_application_budget",
      projectBudget: perMinuteProjectBudget,
      projectUnits: usage.projectUnits,
      userBudget: perMinuteUserBudget,
      userUnits: usage.userUnits,
      windowMs,
    };
  }

  return {
    canConsume,
    getUsageSnapshot,
    recordConsumption,
  };
}