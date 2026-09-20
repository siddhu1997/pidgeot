import { describe, expect, it } from "vitest";

import {
  ACTIVE_SCAN_STATES,
  derivePresentation,
  formatLabel,
  getGroupTitle,
  getUnsubscribeLabel,
} from "@/components/scan/production-scan-model";

describe("production scan model", () => {
  it("maps gmail-ready idle state to a start action", () => {
    expect(derivePresentation(null, "GMAIL_READY")).toEqual(expect.objectContaining({
      actionLabel: "Start scan",
      actionType: "start",
      title: "Start the first real inbox scan.",
      visualMode: "idle",
    }));
  });

  it("maps partial results to an active scan presentation", () => {
    expect(derivePresentation({
      senderGroups: [{ id: "group-1" }],
      state: "PARTIAL_RESULTS_AVAILABLE",
    }, "GMAIL_READY")).toEqual(expect.objectContaining({
      actionLabel: "Pause scan",
      actionType: "pause",
      title: "Real sender groups are appearing while the scan continues.",
      visualMode: "scanning",
    }));
  });

  it("preserves resource-limit messaging without inventing client-side state", () => {
    expect(derivePresentation({
      resourceLimit: {
        message: "Stopped at the retained message limit.",
      },
      senderGroups: [{ id: "group-1" }],
      state: "RESOURCE_LIMIT_REACHED",
    }, "GMAIL_READY")).toEqual(expect.objectContaining({
      actionLabel: null,
      title: "Pidgeot stopped at the scan limit and kept everything it already found.",
      body: "Stopped at the retained message limit.",
      visualMode: "stopped",
    }));
  });

  it("formats sender-group labels from sanitized server fields", () => {
    expect(getGroupTitle({
      displayName: null,
      representativeAddress: "hello@example.com",
      representativeDomain: "example.com",
    })).toBe("example.com");
    expect(getUnsubscribeLabel({ resolutionStatus: "ONE_CLICK_READY" })).toBe("One-click available");
    expect(formatLabel("PARTIAL_RESULTS_AVAILABLE")).toBe("Partial Results Available");
  });

  it("tracks only discovering and partial-results states as active", () => {
    expect(ACTIVE_SCAN_STATES.has("DISCOVERING")).toBe(true);
    expect(ACTIVE_SCAN_STATES.has("PARTIAL_RESULTS_AVAILABLE")).toBe(true);
    expect(ACTIVE_SCAN_STATES.has("PAUSED")).toBe(false);
  });
});