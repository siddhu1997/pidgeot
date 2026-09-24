import { describe, expect, it } from "vitest";

import {
  AUTOMATIC_UNSUBSCRIBE_RESERVATION_STATUSES,
  AUTOMATIC_UNSUBSCRIBE_USAGE_STATES,
  createUnsubscribeUsageStore,
} from "@/lib/unsubscribe/usage-store";

describe("unsubscribe usage store", () => {
  it("tracks distinct successful automatic operations within the current processing lease", () => {
    const usageStore = createUnsubscribeUsageStore();

    expect(usageStore.reserveOperation({
      leaseId: "lease-1",
      limit: 2,
      operationId: "uo_1",
    }).status).toBe(AUTOMATIC_UNSUBSCRIBE_RESERVATION_STATUSES.RESERVED);
    usageStore.finalizeOperation({
      leaseId: "lease-1",
      limit: 2,
      operationId: "uo_1",
      success: true,
    });

    expect(usageStore.reserveOperation({
      leaseId: "lease-1",
      limit: 2,
      operationId: "uo_1",
    }).status).toBe(AUTOMATIC_UNSUBSCRIBE_RESERVATION_STATUSES.ALREADY_COUNTED);
    expect(usageStore.getUsage({ leaseId: "lease-1", limit: 2 })).toEqual(expect.objectContaining({
      leaseId: "lease-1",
      remainingCount: 1,
      state: AUTOMATIC_UNSUBSCRIBE_USAGE_STATES.AVAILABLE,
      successfulCount: 1,
    }));
  });

  it("resets usage when a new processing lease is used", () => {
    const usageStore = createUnsubscribeUsageStore();

    usageStore.reserveOperation({
      leaseId: "lease-1",
      limit: 1,
      operationId: "uo_1",
    });
    usageStore.finalizeOperation({
      leaseId: "lease-1",
      limit: 1,
      operationId: "uo_1",
      success: true,
    });

    expect(usageStore.getUsage({ leaseId: "lease-2", limit: 1 })).toEqual(expect.objectContaining({
      leaseId: "lease-2",
      remainingCount: 1,
      state: AUTOMATIC_UNSUBSCRIBE_USAGE_STATES.AVAILABLE,
      successfulCount: 0,
    }));
  });

  it("does not let an ended lease keep a usable allowance", () => {
    const usageStore = createUnsubscribeUsageStore();

    usageStore.reserveOperation({
      leaseId: "lease-1",
      limit: 2,
      operationId: "uo_1",
    });
    usageStore.finalizeOperation({
      leaseId: "lease-1",
      limit: 2,
      operationId: "uo_1",
      success: true,
    });
    usageStore.discardUsage("lease-1");

    expect(usageStore.reserveOperation({
      leaseId: "lease-1",
      limit: 2,
      operationId: "uo_2",
    }).status).toBe(AUTOMATIC_UNSUBSCRIBE_RESERVATION_STATUSES.LIMIT_REACHED);
    expect(usageStore.getUsage({ leaseId: "lease-1", limit: 2 })).toEqual(expect.objectContaining({
      remainingCount: 0,
      state: AUTOMATIC_UNSUBSCRIBE_USAGE_STATES.LIMIT_REACHED,
    }));
  });
});
