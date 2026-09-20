import { describe, expect, it } from "vitest";

import {
  createGmailQuotaPolicy,
  getGmailMethodQuotaCost,
} from "@/lib/gmail/quota-policy";

describe("gmail quota policy", () => {
  it("exposes only the method costs used by the active Gmail foundation", () => {
    expect(getGmailMethodQuotaCost("messages.get")).toBe(20);
    expect(getGmailMethodQuotaCost("messages.list")).toBe(5);
    expect(getGmailMethodQuotaCost("messages.trash")).toBeNull();
    expect(getGmailMethodQuotaCost("messages.batchModify")).toBeNull();
    expect(getGmailMethodQuotaCost("history.list")).toBeNull();
  });

  it("enforces the local budget without claiming it is Google's live quota", () => {
    const quotaPolicy = createGmailQuotaPolicy({
      perMinuteProjectBudget: 30,
      perMinuteUserBudget: 30,
    });

    expect(quotaPolicy.recordConsumption({ methodName: "messages.get", userId: "user-1" })).toMatchObject({
      allowed: true,
    });
    expect(quotaPolicy.recordConsumption({ methodName: "messages.get", userId: "user-1" })).toMatchObject({
      allowed: false,
      reason: "LOCAL_PROJECT_BUDGET_EXCEEDED",
    });
    expect(quotaPolicy.getUsageSnapshot("user-1").policySource).toBe("local_application_budget");
  });

  it("rejects future methods that have not been added to the active foundation yet", () => {
    const quotaPolicy = createGmailQuotaPolicy();

    expect(quotaPolicy.canConsume({ methodName: "messages.trash", userId: "user-1" })).toMatchObject({
      allowed: false,
      reason: "UNKNOWN_METHOD_COST",
    });
  });
});