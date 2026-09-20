import { SCAN_STATES } from "@/lib/scanning/constants";

const ALLOWED_TRANSITIONS = {
  [SCAN_STATES.COMPLETE]: [],
  [SCAN_STATES.DISCOVERING]: [
    SCAN_STATES.COMPLETE,
    SCAN_STATES.FAILED,
    SCAN_STATES.PARTIAL_RESULTS_AVAILABLE,
    SCAN_STATES.PAUSED,
    SCAN_STATES.REAUTH_REQUIRED,
    SCAN_STATES.RESOURCE_LIMIT_REACHED,
  ],
  [SCAN_STATES.FAILED]: [],
  [SCAN_STATES.PARTIAL_RESULTS_AVAILABLE]: [
    SCAN_STATES.COMPLETE,
    SCAN_STATES.FAILED,
    SCAN_STATES.PARTIAL_RESULTS_AVAILABLE,
    SCAN_STATES.PAUSED,
    SCAN_STATES.REAUTH_REQUIRED,
    SCAN_STATES.RESOURCE_LIMIT_REACHED,
  ],
  [SCAN_STATES.PAUSED]: [
    SCAN_STATES.DISCOVERING,
    SCAN_STATES.FAILED,
    SCAN_STATES.PARTIAL_RESULTS_AVAILABLE,
    SCAN_STATES.REAUTH_REQUIRED,
  ],
  [SCAN_STATES.REAUTH_REQUIRED]: [
    SCAN_STATES.DISCOVERING,
    SCAN_STATES.FAILED,
    SCAN_STATES.PARTIAL_RESULTS_AVAILABLE,
    SCAN_STATES.PAUSED,
  ],
  [SCAN_STATES.RESOURCE_LIMIT_REACHED]: [],
};

export function canTransitionScanState(currentState, nextState) {
  return currentState === nextState || ALLOWED_TRANSITIONS[currentState]?.includes(nextState) || false;
}

export function assertValidScanStateTransition(currentState, nextState) {
  if (!canTransitionScanState(currentState, nextState)) {
    throw new Error(`invalid_scan_state_transition:${currentState}->${nextState}`);
  }
}

export function deriveActiveScanState(scan) {
  return scan.counters.messagesNormalized > 0
    ? SCAN_STATES.PARTIAL_RESULTS_AVAILABLE
    : SCAN_STATES.DISCOVERING;
}

export function isTerminalScanState(state) {
  return state === SCAN_STATES.COMPLETE ||
    state === SCAN_STATES.FAILED ||
    state === SCAN_STATES.RESOURCE_LIMIT_REACHED;
}