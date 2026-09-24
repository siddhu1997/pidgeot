const STORE_KEY = "__pidgeotWorkflowExecutionModeOverrideV1";
const EXECUTION_MODES = new Set(["simulation", "real"]);

function createInvalidModeError() {
  const error = new Error("The workflow execution mode must be simulation or real.");
  error.code = "invalid_execution_mode";
  return error;
}

export function getWorkflowExecutionModeOverride() {
  const value = globalThis[STORE_KEY];
  return EXECUTION_MODES.has(value) ? value : null;
}

export function setWorkflowExecutionModeOverride(mode) {
  if (!EXECUTION_MODES.has(mode)) {
    throw createInvalidModeError();
  }

  globalThis[STORE_KEY] = mode;
  return mode;
}
