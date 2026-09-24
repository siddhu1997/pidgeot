import { describe, expect, it, vi } from "vitest";

import { PROCESSING_LEASE_STATES } from "@/lib/sessions/processing-lease-policy";
import { createUnsubscribeExecutionStore } from "@/lib/unsubscribe/execution-store";
import { createUnsubscribeExecutionService } from "@/lib/unsubscribe/execution-service";
import { createUnsubscribeUsageStore } from "@/lib/unsubscribe/usage-store";

function createOperation(id, overrides = {}) {
  return {
    host: "public.example",
    id,
    status: "AUTOMATIC",
    target: `https://public.example/${id}`,
    type: "RFC8058_ONE_CLICK",
    ...overrides,
  };
}

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
  lease = createLease(),
  operations = [],
  scanState = "PARTIAL_RESULTS_AVAILABLE",
  usageStore = createUnsubscribeUsageStore(),
  transportExecute = vi.fn(async (operation) => ({
    completedAt: Date.now(),
    operationId: operation.id,
    operationType: operation.type,
    status: "SUCCESS",
  })),
} = {}) {
  const executionStore = createUnsubscribeExecutionStore();
  const scanStore = {
    getScanForSession: vi.fn(() => ({ leaseId: lease.id, sessionId: lease.sessionId, state: scanState })),
    getSenderGroupUnsubscribeContextForSession: vi.fn((sessionId, senderGroupId) => {
      if (sessionId !== lease.sessionId || senderGroupId !== "sg_1") {
        return null;
      }

      return {
        leaseId: lease.id,
        operations,
        senderGroupId,
        sessionId,
        summary: { mechanisms: [], resolutionStatus: "AUTOMATIC" },
      };
    }),
  };
  const processingLeaseStore = {
    canProcess: vi.fn(() => canProcess),
    getLease: vi.fn(() => lease),
  };
  const service = createUnsubscribeExecutionService({
    config: {
      automaticUnsubscribeLeaseLimit: 5000,
      unsubscribeExecutionConcurrency: 1,
      unsubscribeMaxRedirects: 2,
      unsubscribeMaxResponseBytes: 16 * 1024,
      unsubscribeRequestTimeoutMs: 5000,
      unsubscribeRetryBaseDelayMs: 1,
      unsubscribeRetryJitterMs: 0,
      unsubscribeRetryMaxAttempts: 2,
      unsubscribeRetryMaxDelayMs: 2,
    },
    executionStore,
    processingLeaseStore,
    scanStore,
    transport: { executeOperation: transportExecute },
    usageStore,
  });

  return {
    executionStore,
    processingLeaseStore,
    scanStore,
    service,
    transportExecute,
    usageStore,
  };
}

describe("unsubscribe execution service", () => {
  it("returns manual-only results when no automatic execution is supported", async () => {
    const { service, transportExecute } = createServiceHarness({
      operations: [createOperation("uo_mailto", {
        status: "MANUAL_ACTION_REQUIRED",
        type: "MAILTO",
      })],
    });

    const result = await service.executeSenderGroup({
      senderGroupId: "sg_1",
      session: { accountKey: "account-key", id: "session-1" },
    });

    expect(result.status).toBe("MANUAL_ACTION_REQUIRED");
    expect(result.operationResults).toEqual([
      expect.objectContaining({
        operationId: "uo_mailto",
        status: "MANUAL_ACTION_REQUIRED",
      }),
    ]);
    expect(transportExecute).not.toHaveBeenCalled();
  });

  it("deduplicates already-completed and concurrent duplicate executions", async () => {
    const deferred = Promise.withResolvers();
    const transportExecute = vi.fn(async (operation) => {
      await deferred.promise;

      return {
        completedAt: Date.now(),
        operationId: operation.id,
        operationType: operation.type,
        status: "SUCCESS",
      };
    });
    const { service } = createServiceHarness({
      operations: [createOperation("uo_1")],
      transportExecute,
    });

    const first = service.executeSenderGroup({ senderGroupId: "sg_1", session: { accountKey: "account-key", id: "session-1" } });
    const second = service.executeSenderGroup({ senderGroupId: "sg_1", session: { accountKey: "account-key", id: "session-1" } });
    deferred.resolve();

    const [firstResult, secondResult] = await Promise.all([first, second]);
    const thirdResult = await service.executeSenderGroup({ senderGroupId: "sg_1", session: { accountKey: "account-key", id: "session-1" } });

    expect(firstResult.status).toBe("ALL_SUCCEEDED");
    expect(secondResult.status).toBe("ALL_SUCCEEDED");
    expect(thirdResult.operationResults[0].status).toBe("ALREADY_COMPLETED");
    expect(transportExecute).toHaveBeenCalledTimes(1);
    expect(service.getUsage({ session: { accountKey: "account-key", id: "session-1" } })).toEqual(expect.objectContaining({
      leaseId: "lease-1",
      remainingCount: 4999,
      successfulCount: 1,
    }));
  });

  it("reports partial success across multiple operations and respects host cooldown after 429", async () => {
    const transportExecute = vi.fn()
      .mockResolvedValueOnce({
        completedAt: Date.now(),
        operationId: "uo_1",
        operationType: "RFC8058_ONE_CLICK",
        retryAfterMs: 5_000,
        status: "FAILED_RETRYABLE",
      })
      .mockResolvedValueOnce({
        completedAt: Date.now(),
        operationId: "uo_2",
        operationType: "RFC8058_ONE_CLICK",
        status: "SUCCESS",
      });
    const { service } = createServiceHarness({
      operations: [
        createOperation("uo_1"),
        createOperation("uo_2", { host: "second.example", target: "https://second.example/unsub" }),
        createOperation("uo_mailto", { status: "MANUAL_ACTION_REQUIRED", type: "MAILTO" }),
      ],
      transportExecute,
    });

    const result = await service.executeSenderGroup({ senderGroupId: "sg_1", session: { accountKey: "account-key", id: "session-1" } });

    expect(result.status).toBe("PARTIAL_SUCCESS");
    expect(result.operationResults).toEqual(expect.arrayContaining([
      expect.objectContaining({ operationId: "uo_1", status: "FAILED_RETRYABLE" }),
      expect.objectContaining({ operationId: "uo_2", status: "SUCCESS" }),
      expect.objectContaining({ operationId: "uo_mailto", status: "MANUAL_ACTION_REQUIRED" }),
    ]));
  });

  it("blocks new work when paused or lease-expired before execution begins", async () => {
    const pausedHarness = createServiceHarness({
      canProcess: false,
      lease: createLease({ state: PROCESSING_LEASE_STATES.PAUSED }),
      operations: [createOperation("uo_1")],
      scanState: "PAUSED",
    });

    const paused = await pausedHarness.service.executeSenderGroup({
      senderGroupId: "sg_1",
      session: { accountKey: "account-key", id: "session-1" },
    });

    expect(paused.operationResults[0].status).toBe("PAUSED");
    expect(pausedHarness.transportExecute).not.toHaveBeenCalled();

    const expiredHarness = createServiceHarness({
      canProcess: false,
      lease: createLease({ state: PROCESSING_LEASE_STATES.EXPIRED }),
      operations: [createOperation("uo_1")],
    });

    const expired = await expiredHarness.service.executeSenderGroup({
      senderGroupId: "sg_1",
      session: { accountKey: "account-key", id: "session-1" },
    });

    expect(expired.operationResults[0].status).toBe("LEASE_EXPIRED");
  });

  it("lets an in-flight request finish but does not start new work after pause or lease expiry", async () => {
    let remainingCanProcess = true;
    const lease = createLease();
    const transportExecute = vi.fn(async (operation) => {
      remainingCanProcess = false;

      return {
        completedAt: Date.now(),
        operationId: operation.id,
        operationType: operation.type,
        status: "SUCCESS",
      };
    });
    const executionStore = createUnsubscribeExecutionStore();
    const scanStore = {
      getScanForSession: vi.fn(() => ({
        leaseId: lease.id,
        sessionId: lease.sessionId,
        state: remainingCanProcess ? "PARTIAL_RESULTS_AVAILABLE" : "PAUSED",
      })),
      getSenderGroupUnsubscribeContextForSession: vi.fn(() => ({
        leaseId: lease.id,
        operations: [createOperation("uo_1"), createOperation("uo_2")],
        senderGroupId: "sg_1",
        sessionId: lease.sessionId,
        summary: { mechanisms: [], resolutionStatus: "AUTOMATIC" },
      })),
    };
    const processingLeaseStore = {
      canProcess: vi.fn(() => remainingCanProcess),
      getLease: vi.fn(() => ({
        ...lease,
        state: remainingCanProcess ? PROCESSING_LEASE_STATES.ACTIVE : PROCESSING_LEASE_STATES.PAUSED,
      })),
    };
    const service = createUnsubscribeExecutionService({
      config: {
        unsubscribeExecutionConcurrency: 1,
        unsubscribeMaxRedirects: 2,
        unsubscribeMaxResponseBytes: 16 * 1024,
        unsubscribeRequestTimeoutMs: 5000,
        unsubscribeRetryBaseDelayMs: 1,
        unsubscribeRetryJitterMs: 0,
        unsubscribeRetryMaxAttempts: 2,
        unsubscribeRetryMaxDelayMs: 2,
      },
      executionStore,
      processingLeaseStore,
      scanStore,
      transport: { executeOperation: transportExecute },
    });

    const result = await service.executeSenderGroup({ senderGroupId: "sg_1", session: { accountKey: "account-key", id: "session-1" } });

    expect(result.operationResults).toEqual(expect.arrayContaining([
      expect.objectContaining({ operationId: "uo_1", status: "SUCCESS" }),
      expect.objectContaining({ operationId: "uo_2", status: "PAUSED" }),
    ]));
    expect(transportExecute).toHaveBeenCalledTimes(1);
  });

  it("rejects cross-session sender-group access", async () => {
    const { service } = createServiceHarness({
      operations: [createOperation("uo_1")],
    });

    await expect(service.executeSenderGroup({
      senderGroupId: "missing",
      session: { accountKey: "account-key", id: "session-2" },
    })).rejects.toMatchObject({ code: "unsubscribe_sender_group_not_found" });
  });

  it("does not consume quota for manual-only operations", async () => {
    const { service } = createServiceHarness({
      operations: [createOperation("uo_mailto", {
        status: "MANUAL_ACTION_REQUIRED",
        type: "MAILTO",
      })],
    });

    await service.executeSenderGroup({ senderGroupId: "sg_1", session: { accountKey: "account-key", id: "session-1" } });

    expect(service.getUsage({ session: { accountKey: "account-key", id: "session-1" } })).toEqual(expect.objectContaining({
      leaseId: "lease-1",
      remainingCount: 5000,
      successfulCount: 0,
    }));
  });

  it("enforces the automatic unsubscribe limit for the current processing lease", async () => {
    const usageStore = createUnsubscribeUsageStore();
    const baseConfig = {
      automaticUnsubscribeLeaseLimit: 1,
      unsubscribeExecutionConcurrency: 1,
      unsubscribeMaxRedirects: 2,
      unsubscribeMaxResponseBytes: 16 * 1024,
      unsubscribeRequestTimeoutMs: 5000,
      unsubscribeRetryBaseDelayMs: 1,
      unsubscribeRetryJitterMs: 0,
      unsubscribeRetryMaxAttempts: 2,
      unsubscribeRetryMaxDelayMs: 2,
    };
    const firstHarness = createServiceHarness({
      operations: [createOperation("uo_1")],
      usageStore,
    });
    const secondHarness = createServiceHarness({
      operations: [createOperation("uo_2")],
      usageStore,
    });
    const firstService = createUnsubscribeExecutionService({
      config: baseConfig,
      executionStore: firstHarness.executionStore,
      processingLeaseStore: firstHarness.processingLeaseStore,
      scanStore: firstHarness.scanStore,
      transport: { executeOperation: firstHarness.transportExecute },
      usageStore,
    });
    const secondService = createUnsubscribeExecutionService({
      config: baseConfig,
      executionStore: secondHarness.executionStore,
      processingLeaseStore: secondHarness.processingLeaseStore,
      scanStore: secondHarness.scanStore,
      transport: { executeOperation: secondHarness.transportExecute },
      usageStore,
    });
    const session = { accountKey: "account-key", id: "session-1" };

    const firstResult = await firstService.executeSenderGroup({ senderGroupId: "sg_1", session });
    const secondResult = await secondService.executeSenderGroup({ senderGroupId: "sg_1", session });

    expect(firstResult.operationResults[0].status).toBe("SUCCESS");
    expect(secondResult.operationResults[0].status).toBe("USAGE_LIMIT_REACHED");
    expect(firstHarness.transportExecute).toHaveBeenCalledTimes(1);
    expect(secondHarness.transportExecute).not.toHaveBeenCalled();
    expect(secondService.getUsage({ session })).toEqual(expect.objectContaining({
      leaseId: "lease-1",
      remainingCount: 0,
      state: "LIMIT_REACHED",
      successfulCount: 1,
    }));
  });

  it("starts a fresh allowance when a new processing lease is used", async () => {
    const usageStore = createUnsubscribeUsageStore();
    const firstHarness = createServiceHarness({
      operations: [createOperation("uo_1")],
      usageStore,
    });
    const firstResult = await firstHarness.service.executeSenderGroup({
      senderGroupId: "sg_1",
      session: { accountKey: "account-key", id: "session-1" },
    });

    expect(firstResult.operationResults[0].status).toBe("SUCCESS");
    expect(firstHarness.service.getUsage({
      session: { accountKey: "account-key", id: "session-1" },
    })).toEqual(expect.objectContaining({
      leaseId: "lease-1",
      successfulCount: 1,
    }));

    const nextLease = createLease({ id: "lease-2" });
    const secondHarness = createServiceHarness({
      lease: nextLease,
      operations: [createOperation("uo_2")],
      usageStore,
    });
    const secondResult = await secondHarness.service.executeSenderGroup({
      senderGroupId: "sg_1",
      session: { accountKey: "account-key", id: "session-1" },
    });

    expect(secondResult.operationResults[0].status).toBe("SUCCESS");
    expect(secondHarness.service.getUsage({
      session: { accountKey: "account-key", id: "session-1" },
    })).toEqual(expect.objectContaining({
      leaseId: "lease-2",
      remainingCount: 4999,
      successfulCount: 1,
    }));
  });
});