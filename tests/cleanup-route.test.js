import { afterEach, describe, expect, it, vi } from "vitest";

const getRequiredCurrentAuthSession = vi.fn();
const executeSenderGroupCleanup = vi.fn();
const getScanStatus = vi.fn();

vi.mock("@/lib/auth/current-session", () => ({
  getRequiredCurrentAuthSession,
}));

vi.mock("@/lib/cleanup/execution-service", () => ({
  createCleanupExecutionService() {
    return {
      executeSenderGroupCleanup,
    };
  },
}));

vi.mock("@/lib/scanning/scanner", () => ({
  createScanService() {
    return {
      getScanStatus,
    };
  },
}));

describe("cleanup execute route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unauthenticated requests", async () => {
    const { POST } = await import("@/app/api/cleanup/execute/route");
    getRequiredCurrentAuthSession.mockRejectedValue(Object.assign(new Error("missing"), { code: "session_not_found" }));

    const response = await POST(new Request("https://pidgeot.test/api/cleanup/execute", {
      body: JSON.stringify({ senderGroupId: "sg_1" }),
      method: "POST",
    }));

    expect(response.status).toBe(401);
  });

  it("rejects arbitrary message ids and extra request fields", async () => {
    const { POST } = await import("@/app/api/cleanup/execute/route");

    const response = await POST(new Request("https://pidgeot.test/api/cleanup/execute", {
      body: JSON.stringify({
        messageIds: ["m-1"],
        senderGroupId: "sg_1",
      }),
      method: "POST",
    }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("invalid_cleanup_request");
    expect(executeSenderGroupCleanup).not.toHaveBeenCalled();
  });

  it("returns only sanitized cleanup state and updated scan data", async () => {
    const { POST } = await import("@/app/api/cleanup/execute/route");
    getRequiredCurrentAuthSession.mockResolvedValue({ id: "session-1" });
    executeSenderGroupCleanup.mockResolvedValue({
      messageResults: [
        { messageId: "m-1", status: "SUCCESS" },
      ],
      senderGroupId: "sg_1",
      status: "PARTIAL_SUCCESS",
      summary: {
        completedCount: 1,
        failedCount: 1,
        remainingEligibleCount: 1,
        retryableFailureCount: 1,
        successfulCount: 1,
        totalEligibleCount: 2,
      },
    });
    getScanStatus.mockReturnValue({
      senderGroups: [
        {
          id: "sg_1",
          messageCount: 2,
          unreadCount: 1,
        },
      ],
      state: "PARTIAL_RESULTS_AVAILABLE",
    });

    const response = await POST(new Request("https://pidgeot.test/api/cleanup/execute", {
      body: JSON.stringify({ senderGroupId: "sg_1" }),
      method: "POST",
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.cleanupExecution).toEqual({
      senderGroupId: "sg_1",
      status: "PARTIAL_SUCCESS",
      summary: {
        completedCount: 1,
        failedCount: 1,
        remainingEligibleCount: 1,
        retryableFailureCount: 1,
        successfulCount: 1,
        totalEligibleCount: 2,
      },
    });
    expect(JSON.stringify(payload)).not.toContain("m-1");
  });
});