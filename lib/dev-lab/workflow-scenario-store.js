const STORE_KEY = "__pidgeotDevWorkflowScenarioV1";

export const WORKFLOW_SCENARIO_IDS = {
  ALREADY_COMPLETED: "ALREADY_COMPLETED",
  COMPLETED: "COMPLETED",
  FAILED_PERMANENT: "FAILED_PERMANENT",
  FAILED_RETRYABLE: "FAILED_RETRYABLE",
  LEASE_EXPIRED: "LEASE_EXPIRED",
  MANUAL_ACTION_REQUIRED: "MANUAL_ACTION_REQUIRED",
  PARTIAL_SUCCESS: "PARTIAL_SUCCESS",
  PAUSED: "PAUSED",
  REAUTH_REQUIRED: "REAUTH_REQUIRED",
  UNSAFE_TARGET: "UNSAFE_TARGET",
  USAGE_LIMIT_REACHED: "USAGE_LIMIT_REACHED",
};

const SCENARIO_ID_SET = new Set(Object.values(WORKFLOW_SCENARIO_IDS));

function createInvalidScenarioError() {
  const error = new Error("The workflow scenario request was invalid.");
  error.code = "invalid_workflow_scenario";
  return error;
}

export function isWorkflowScenarioId(value) {
  return SCENARIO_ID_SET.has(value);
}

export function getWorkflowScenario() {
  const value = globalThis[STORE_KEY];

  if (!value || typeof value !== "object") {
    return null;
  }

  if (!isWorkflowScenarioId(value.scenarioId) || !value.sessionId || !value.scanId) {
    return null;
  }

  return value;
}

export function setWorkflowScenario({ scanId, scenarioId, senderOutcomes, sessionId }) {
  if (!isWorkflowScenarioId(scenarioId) || !sessionId || !scanId) {
    throw createInvalidScenarioError();
  }

  const next = {
    appliedAt: Date.now(),
    scanId,
    scenarioId,
    senderOutcomes: senderOutcomes && typeof senderOutcomes === "object" ? senderOutcomes : {},
    sessionId,
  };

  globalThis[STORE_KEY] = next;
  return next;
}

export function clearWorkflowScenario() {
  globalThis[STORE_KEY] = null;
  return null;
}
