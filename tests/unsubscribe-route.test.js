import { afterEach, describe, expect, it, vi } from "vitest";

const getRequiredCurrentAuthSession = vi.fn();
const executeSenderGroup = vi.fn();

vi.mock("@/lib/auth/current-session", () => ({
  getRequiredCurrentAuthSession,
}));

vi.mock("@/lib/unsubscribe/execution-service", () => ({
  createUnsubscribeExecutionService() {
    return {
      executeSenderGroup,
    };
  },
}));

describe("unsubscribe execute route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects arbitrary url, headers, and body fields from the browser", async () => {
    const { POST } = await import("@/app/api/unsubscribe/execute/route");

    const response = await POST(new Request("https://pidgeot.test/api/unsubscribe/execute", {
      body: JSON.stringify({
        body: "List-Unsubscribe=One-Click",
        headers: { authorization: "Bearer no" },
        senderGroupId: "sg_1",
        url: "https://evil.example/unsub",
      }),
      method: "POST",
    }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("invalid_unsubscribe_request");
    expect(getRequiredCurrentAuthSession).not.toHaveBeenCalled();
    expect(executeSenderGroup).not.toHaveBeenCalled();
  });

  it("executes only by sender-group identity and returns sanitized results", async () => {
    const { POST } = await import("@/app/api/unsubscribe/execute/route");
    getRequiredCurrentAuthSession.mockResolvedValue({ id: "session-1" });
    executeSenderGroup.mockResolvedValue({
      operationResults: [
        {
          operationId: "uo_1",
          operationType: "RFC8058_ONE_CLICK",
          status: "SUCCESS",
        },
      ],
      senderGroupId: "sg_1",
      status: "ALL_SUCCEEDED",
      summary: {
        alreadyCompletedCount: 0,
        manualCount: 0,
        successfulCount: 1,
        totalOperationCount: 1,
      },
    });

    const response = await POST(new Request("https://pidgeot.test/api/unsubscribe/execute", {
      body: JSON.stringify({ senderGroupId: "sg_1" }),
      method: "POST",
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(executeSenderGroup).toHaveBeenCalledWith({
      senderGroupId: "sg_1",
      session: { id: "session-1" },
    });
    expect(payload.unsubscribeExecution).toEqual({
      operationResults: [
        {
          operationId: "uo_1",
          operationType: "RFC8058_ONE_CLICK",
          status: "SUCCESS",
        },
      ],
      senderGroupId: "sg_1",
      status: "ALL_SUCCEEDED",
      summary: {
        alreadyCompletedCount: 0,
        manualCount: 0,
        successfulCount: 1,
        totalOperationCount: 1,
      },
    });
    expect(JSON.stringify(payload)).not.toContain("https://");
  });
});