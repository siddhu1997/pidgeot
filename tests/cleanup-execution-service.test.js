import { describe, expect, it, vi } from "vitest";

import { PROCESSING_LEASE_STATES } from "@/lib/sessions/processing-lease-policy";
import { createCleanupExecutionStore } from "@/lib/cleanup/execution-store";
import { createCleanupExecutionService } from "@/lib/cleanup/execution-service";
import { createScanStore } from "@/lib/scanning/scan-store";
import { SCAN_SOURCES } from "@/lib/scanning/constants";

function createLease(overrides = {}) {
  return {
    expiresAt: Date.now() + 60_000,
    id: "lease-1",
    sessionId: "session-1",
    state: PROCESSING_LEASE_STATES.ACTIVE,
    ...overrides,
  };
}

function createServiceHarness({
  canProcess = true,
  eligibleMessageIds = ["m-1"],
  lease = createLease(),
  gmailTrash = vi.fn(async () => ({ id: "m-1", labelIds: ["TRASH"] })),
  scanState = "PARTIAL_RESULTS_AVAILABLE",
} = {}) {
  const executionStore = createCleanupExecutionStore();
  const scanStore = {
    applyCleanupTrashMutationsForSession: vi.fn(() => ({ senderGroups: [] })),
    getScanForSession: vi.fn(() => ({ leaseId: lease.id, sessionId: lease.sessionId, state: scanState })),
    getSenderGroupCleanupContextForSession: vi.fn((sessionId, senderGroupId) => {
      if (sessionId !== lease.sessionId || senderGroupId !== "sg_1") {
        return null;
      }

      return {
        eligibleMessageIds,
        leaseId: lease.id,
        senderGroupId,
        sessionId,
      };
    }),
  };
  const processingLeaseStore = {
    canProcess: vi.fn(() => canProcess),
    getLease: vi.fn(() => lease),
  };
  const service = createCleanupExecutionService({
    config: {
      cleanupMutationConcurrency: 2,
    },
    executionStore,
    gmailClient: { trashMessage: gmailTrash },
    processingLeaseStore,
    scanStore,
  });

  return {
    executionStore,
    gmailTrash,
    processingLeaseStore,
    scanStore,
    service,
  };
}

describe("cleanup execution service", () => {
  it("executes eligible unread active messages with bounded concurrency and updates scan state on success", async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    const gmailTrash = vi.fn(async ({ messageId }) => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await Promise.resolve();
      concurrent -= 1;

      return { id: messageId, labelIds: ["TRASH"] };
    });
    const { scanStore, service } = createServiceHarness({
      eligibleMessageIds: ["m-1", "m-2", "m-3"],
      gmailTrash,
    });

    const result = await service.executeSenderGroupCleanup({
      senderGroupId: "sg_1",
      session: { id: "session-1" },
    });

    expect(result.status).toBe("ALL_SUCCEEDED");
    expect(result.summary).toEqual(expect.objectContaining({
      completedCount: 3,
      remainingEligibleCount: 0,
      successfulCount: 3,
      totalEligibleCount: 3,
    }));
    expect(maxConcurrent).toBeLessThanOrEqual(2);
    expect(scanStore.applyCleanupTrashMutationsForSession).toHaveBeenCalledWith("session-1", ["m-1", "m-2", "m-3"]);
  });

  it("reports partial success and preserves retryable failures", async () => {
    const gmailTrash = vi.fn(async ({ messageId }) => {
      if (messageId === "m-2") {
        const error = new Error("rate");
        error.category = "RATE_LIMITED";
        throw error;
      }

      return { id: messageId, labelIds: ["TRASH"] };
    });
    const { service } = createServiceHarness({
      eligibleMessageIds: ["m-1", "m-2"],
      gmailTrash,
    });

    const result = await service.executeSenderGroupCleanup({
      senderGroupId: "sg_1",
      session: { id: "session-1" },
    });

    expect(result.status).toBe("PARTIAL_SUCCESS");
    expect(result.summary).toEqual(expect.objectContaining({
      completedCount: 1,
      failedCount: 1,
      remainingEligibleCount: 1,
      retryableFailureCount: 1,
    }));
  });

  it("classifies permanent failures and reauth-required failures separately", async () => {
    const permanentHarness = createServiceHarness({
      eligibleMessageIds: ["m-1"],
      gmailTrash: vi.fn(async () => {
        const error = new Error("missing");
        error.category = "MALFORMED_REQUEST";
        throw error;
      }),
    });
    const reauthHarness = createServiceHarness({
      eligibleMessageIds: ["m-1"],
      gmailTrash: vi.fn(async () => {
        const error = new Error("reauth");
        error.category = "INVALID_REVOKED_CREDENTIAL";
        throw error;
      }),
    });

    const permanent = await permanentHarness.service.executeSenderGroupCleanup({ senderGroupId: "sg_1", session: { id: "session-1" } });
    const reauth = await reauthHarness.service.executeSenderGroupCleanup({ senderGroupId: "sg_1", session: { id: "session-1" } });

    expect(permanent.summary.permanentFailureCount).toBe(1);
    expect(reauth.summary.reauthRequiredCount).toBe(1);
  });

  it("prevents new mutations when paused or lease-expired before execution begins", async () => {
    const pausedHarness = createServiceHarness({
      canProcess: false,
      lease: createLease({ state: PROCESSING_LEASE_STATES.PAUSED }),
      scanState: "PAUSED",
    });
    const expiredHarness = createServiceHarness({
      canProcess: false,
      lease: createLease({ state: PROCESSING_LEASE_STATES.EXPIRED }),
    });

    const paused = await pausedHarness.service.executeSenderGroupCleanup({ senderGroupId: "sg_1", session: { id: "session-1" } });
    const expired = await expiredHarness.service.executeSenderGroupCleanup({ senderGroupId: "sg_1", session: { id: "session-1" } });

    expect(paused.summary.failedCount).toBe(1);
    expect(expired.summary.failedCount).toBe(1);
    expect(pausedHarness.gmailTrash).not.toHaveBeenCalled();
    expect(expiredHarness.gmailTrash).not.toHaveBeenCalled();
  });

  it("lets an in-flight mutation finish but blocks later work after pause", async () => {
    let remainingCanProcess = true;
    const lease = createLease();
    const executionStore = createCleanupExecutionStore();
    const scanStore = {
      applyCleanupTrashMutationsForSession: vi.fn(),
      getScanForSession: vi.fn(() => ({
        leaseId: lease.id,
        sessionId: lease.sessionId,
        state: remainingCanProcess ? "PARTIAL_RESULTS_AVAILABLE" : "PAUSED",
      })),
      getSenderGroupCleanupContextForSession: vi.fn(() => ({
        eligibleMessageIds: ["m-1", "m-2"],
        leaseId: lease.id,
        senderGroupId: "sg_1",
        sessionId: lease.sessionId,
      })),
    };
    const processingLeaseStore = {
      canProcess: vi.fn(() => remainingCanProcess),
      getLease: vi.fn(() => ({
        ...lease,
        state: remainingCanProcess ? PROCESSING_LEASE_STATES.ACTIVE : PROCESSING_LEASE_STATES.PAUSED,
      })),
    };
    const gmailTrash = vi.fn(async ({ messageId }) => {
      if (messageId === "m-1") {
        remainingCanProcess = false;
      }

      return { id: messageId, labelIds: ["TRASH"] };
    });
    const service = createCleanupExecutionService({
      config: { cleanupMutationConcurrency: 1 },
      executionStore,
      gmailClient: { trashMessage: gmailTrash },
      processingLeaseStore,
      scanStore,
    });

    const result = await service.executeSenderGroupCleanup({ senderGroupId: "sg_1", session: { id: "session-1" } });

    expect(result.summary.completedCount).toBe(1);
    expect(result.summary.remainingEligibleCount).toBe(1);
    expect(gmailTrash).toHaveBeenCalledTimes(1);
  });

  it("does not infinitely retry already-absent messages and allows retry after retryable partial failure", async () => {
    const gmailTrash = vi.fn(async ({ messageId }) => {
      if (messageId === "m-1") {
        const error = new Error("missing");
        error.category = "MALFORMED_REQUEST";
        throw error;
      }

      const error = new Error("transient");
      error.category = "TRANSIENT_API_FAILURE";
      throw error;
    });
    const { service } = createServiceHarness({
      eligibleMessageIds: ["m-1", "m-2"],
      gmailTrash,
    });

    await service.executeSenderGroupCleanup({ senderGroupId: "sg_1", session: { id: "session-1" } });
    await service.executeSenderGroupCleanup({ senderGroupId: "sg_1", session: { id: "session-1" } });

    expect(gmailTrash.mock.calls.filter(([input]) => input.messageId === "m-1")).toHaveLength(1);
    expect(gmailTrash.mock.calls.filter(([input]) => input.messageId === "m-2")).toHaveLength(2);
  });

  it("does not select a successfully trashed unread message on a second cleanup run", async () => {
    const scanStore = createScanStore({ now: () => 1000 });
    const scan = scanStore.createSessionScan({
      accountKey: "account-key",
      leaseId: "lease-1",
      metadataConcurrency: 5,
      pageSize: 50,
      sessionId: "session-1",
    });

    scanStore.beginSourcePage(scan.id, {
      messageRefs: [{ id: "m-1" }],
      nextPageToken: null,
      source: SCAN_SOURCES.ACTIVE_MAIL,
    });
    scanStore.commitSourcePageProgress(scan.id, {
      metadataFailures: 0,
      normalizedMessages: [{
        headers: {
          from: "Alerts <alerts@example.com>",
          listId: null,
          listUnsubscribe: null,
          listUnsubscribePost: null,
          precedence: null,
          replyTo: null,
          sender: null,
        },
        id: "m-1",
        labelIds: ["UNREAD", "INBOX"],
        source: SCAN_SOURCES.ACTIVE_MAIL,
      }],
      remainingPendingMessageIds: [],
      source: SCAN_SOURCES.ACTIVE_MAIL,
    });

    const senderGroupId = scanStore.getSanitizedScanForSession("session-1").senderGroups[0].id;
    const processingLeaseStore = {
      canProcess: vi.fn(() => true),
      getLease: vi.fn(() => createLease()),
    };
    const gmailTrash = vi.fn(async ({ messageId }) => ({ id: messageId, labelIds: ["TRASH", "UNREAD"] }));
    const service = createCleanupExecutionService({
      config: { cleanupMutationConcurrency: 1 },
      executionStore: createCleanupExecutionStore(),
      gmailClient: { trashMessage: gmailTrash },
      processingLeaseStore,
      scanStore,
    });

    const firstRun = await service.executeSenderGroupCleanup({
      senderGroupId,
      session: { id: "session-1" },
    });
    const secondRun = await service.executeSenderGroupCleanup({
      senderGroupId,
      session: { id: "session-1" },
    });

    expect(firstRun.summary).toEqual(expect.objectContaining({
      successfulCount: 1,
      totalEligibleCount: 1,
    }));
    expect(secondRun.summary).toEqual(expect.objectContaining({
      completedCount: 0,
      remainingEligibleCount: 0,
      successfulCount: 0,
      totalEligibleCount: 0,
    }));
    expect(gmailTrash).toHaveBeenCalledTimes(1);
    expect(scanStore.listNormalizedMessagesForSession("session-1").find((message) => message.id === "m-1")).toEqual(
      expect.objectContaining({
        labelIds: expect.arrayContaining(["TRASH", "UNREAD"]),
        source: SCAN_SOURCES.TRASH,
      }),
    );
    expect(scanStore.getSanitizedScanForSession("session-1").senderGroups[0]).toEqual(
      expect.objectContaining({
        activeCount: 0,
        messageCount: 1,
        sourceCounts: {
          ACTIVE_MAIL: 0,
          TRASH: 1,
        },
        trashCount: 1,
        unreadCount: 1,
      }),
    );
  });

  it("rejects cross-session sender-group access", async () => {
    const { service } = createServiceHarness();

    await expect(service.executeSenderGroupCleanup({
      senderGroupId: "missing",
      session: { id: "session-2" },
    })).rejects.toMatchObject({ code: "cleanup_sender_group_not_found" });
  });
});