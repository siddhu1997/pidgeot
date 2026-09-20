import { describe, expect, it } from "vitest";

import { SCAN_STATES } from "@/lib/scanning/constants";
import {
  assertValidScanStateTransition,
  canTransitionScanState,
  deriveActiveScanState,
} from "@/lib/scanning/state-machine";

describe("scan state machine", () => {
  it("allows only valid transitions", () => {
    expect(canTransitionScanState(SCAN_STATES.DISCOVERING, SCAN_STATES.PAUSED)).toBe(true);
    expect(canTransitionScanState(SCAN_STATES.PAUSED, SCAN_STATES.DISCOVERING)).toBe(true);
    expect(canTransitionScanState(SCAN_STATES.COMPLETE, SCAN_STATES.DISCOVERING)).toBe(false);
  });

  it("rejects invalid transitions", () => {
    expect(() => {
      assertValidScanStateTransition(SCAN_STATES.COMPLETE, SCAN_STATES.DISCOVERING);
    }).toThrow("invalid_scan_state_transition");
  });

  it("derives partial-results state once normalized data exists", () => {
    expect(deriveActiveScanState({ counters: { messagesNormalized: 0 } })).toBe(SCAN_STATES.DISCOVERING);
    expect(deriveActiveScanState({ counters: { messagesNormalized: 1 } })).toBe(
      SCAN_STATES.PARTIAL_RESULTS_AVAILABLE,
    );
  });
});