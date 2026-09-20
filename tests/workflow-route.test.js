import { afterEach, describe, expect, it, vi } from "vitest";

const getRequiredCurrentAuthSession = vi.fn();
const executeSelections = vi.fn();
const getWorkflowStatus = vi.fn();

vi.mock("@/lib/auth/current-session", () => ({
  getRequiredCurrentAuthSession,
}));

vi.mock("@/lib/workflow/service", () => ({
  createWorkflowService() {
    return {
      executeSelections,
      getWorkflowStatus,
    };
  },
}));

describe("workflow routes", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unauthenticated workflow status requests", async () => {
    const { GET } = await import("@/app/api/workflow/status/route");
    getRequiredCurrentAuthSession.mockRejectedValue(Object.assign(new Error("missing"), { code: "session_not_found" }));

    const response = await GET();

    expect(response.status).toBe(401);
  });

  it("rejects browser supplied message ids, unsubscribe urls, and operation definitions", async () => {
    const { POST } = await import("@/app/api/workflow/execute/route");

    const response = await POST(new Request("https://pidgeot.test/api/workflow/execute", {
      body: JSON.stringify({
        selections: [{
          actions: {
            cleanup: true,
            operationIds: ["uo_1"],
            unsubscribe: true,
            unsubscribeUrl: "https://evil.example/unsub",
          },
          messageIds: ["m-1"],
          senderGroupId: "sg_1",
        }],
      }),
      method: "POST",
    }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("invalid_workflow_request");
    expect(executeSelections).not.toHaveBeenCalled();
  });

  it("returns sanitized workflow execution state", async () => {
    const { POST } = await import("@/app/api/workflow/execute/route");
    getRequiredCurrentAuthSession.mockResolvedValue({ id: "session-1" });
    executeSelections.mockResolvedValue({
      actionResults: [{
        cleanupExecution: {
          senderGroupId: "sg_1",
          status: "ALL_SUCCEEDED",
          summary: {
            completedCount: 1,
            successfulCount: 1,
            totalEligibleCount: 1,
          },
        },
        senderGroupId: "sg_1",
        unsubscribeExecution: {
          operationResults: [{
            operationId: "uo_1",
            operationType: "RFC8058_ONE_CLICK",
            status: "SUCCESS",
          }],
          senderGroupId: "sg_1",
          status: "ALL_SUCCEEDED",
          summary: {
            successfulCount: 1,
            totalOperationCount: 1,
          },
        },
      }],
      workflow: {
        processing: {
          canProcess: true,
          leaseState: "ACTIVE",
          pauseReason: null,
          scanState: "PARTIAL_RESULTS_AVAILABLE",
        },
        scan: {
          senderGroups: [{
            id: "sg_1",
            messageCount: 2,
            representativeAddress: "alerts@example.com",
            workflow: {
              cleanupEligibleCount: 0,
              cleanupExecution: {
                execution: {
                  summary: {
                    successfulCount: 1,
                  },
                },
                state: "COMPLETED",
              },
              discovered: true,
              unsubscribeExecution: {
                execution: {
                  operationResults: [{
                    operationId: "uo_1",
                    operationType: "RFC8058_ONE_CLICK",
                    status: "SUCCESS",
                  }],
                },
                state: "COMPLETED",
              },
            },
          }],
          state: "PARTIAL_RESULTS_AVAILABLE",
        },
      },
    });

    const response = await POST(new Request("https://pidgeot.test/api/workflow/execute", {
      body: JSON.stringify({
        selections: [{
          actions: {
            cleanup: true,
            unsubscribe: true,
          },
          senderGroupId: "sg_1",
        }],
      }),
      method: "POST",
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(executeSelections).toHaveBeenCalledWith({
      selections: [{
        actions: {
          cleanup: true,
          unsubscribe: true,
        },
        senderGroupId: "sg_1",
      }],
      session: { id: "session-1" },
    });
    expect(JSON.stringify(payload)).not.toContain("https://");
    expect(JSON.stringify(payload)).not.toContain("messageId");
    expect(JSON.stringify(payload)).not.toContain("Authorization");
  });

  it("rejects foreign sender group access without revealing cross session state", async () => {
    const { POST } = await import("@/app/api/workflow/execute/route");
    getRequiredCurrentAuthSession.mockResolvedValue({ id: "session-1" });
    executeSelections.mockRejectedValue(Object.assign(new Error("missing"), { code: "workflow_sender_group_not_found" }));

    const response = await POST(new Request("https://pidgeot.test/api/workflow/execute", {
      body: JSON.stringify({
        selections: [{
          actions: { cleanup: true },
          senderGroupId: "sg_foreign",
        }],
      }),
      method: "POST",
    }));

    expect(response.status).toBe(404);
  });
});