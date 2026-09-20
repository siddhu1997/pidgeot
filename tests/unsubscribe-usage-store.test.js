import { describe, expect, it } from "vitest";

import {
  AUTOMATIC_UNSUBSCRIBE_RESERVATION_STATUSES,
  AUTOMATIC_UNSUBSCRIBE_USAGE_STATES,
  createUnsubscribeUsageStore,
} from "@/lib/unsubscribe/usage-store";

describe("unsubscribe usage store", () => {
  it("tracks distinct successful automatic operations within the current month", () => {
    const usageStore = createUnsubscribeUsageStore({ now: () => Date.UTC(2026, 8, 20) });

    expect(usageStore.reserveOperation({
      accountKey: "account-key",
      monthlyLimit: 2,
      operationId: "uo_1",
    }).status).toBe(AUTOMATIC_UNSUBSCRIBE_RESERVATION_STATUSES.RESERVED);
    usageStore.finalizeOperation({
      accountKey: "account-key",
      monthlyLimit: 2,
      operationId: "uo_1",
      success: true,
    });

    expect(usageStore.reserveOperation({
      accountKey: "account-key",
      monthlyLimit: 2,
      operationId: "uo_1",
    }).status).toBe(AUTOMATIC_UNSUBSCRIBE_RESERVATION_STATUSES.ALREADY_COUNTED);
    expect(usageStore.getUsage({ accountKey: "account-key", monthlyLimit: 2 })).toEqual(expect.objectContaining({
      monthKey: "2026-09",
      remainingCount: 1,
      state: AUTOMATIC_UNSUBSCRIBE_USAGE_STATES.AVAILABLE,
      successfulCount: 1,
    }));
  });

  it("resets usage when the calendar month rolls over", () => {
    let currentTime = Date.UTC(2026, 8, 30);
    const usageStore = createUnsubscribeUsageStore({ now: () => currentTime });

    usageStore.reserveOperation({
      accountKey: "account-key",
      monthlyLimit: 1,
      operationId: "uo_1",
    });
    usageStore.finalizeOperation({
      accountKey: "account-key",
      monthlyLimit: 1,
      operationId: "uo_1",
      success: true,
    });

    currentTime = Date.UTC(2026, 9, 1);

    expect(usageStore.getUsage({ accountKey: "account-key", monthlyLimit: 1 })).toEqual(expect.objectContaining({
      monthKey: "2026-10",
      remainingCount: 1,
      state: AUTOMATIC_UNSUBSCRIBE_USAGE_STATES.AVAILABLE,
      successfulCount: 0,
    }));
  });
});