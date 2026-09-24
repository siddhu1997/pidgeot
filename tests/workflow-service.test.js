import { describe, expect, it, vi } from "vitest";

import { createCleanupExecutionService } from "@/lib/cleanup/execution-service";
import { createCleanupExecutionStore } from "@/lib/cleanup/execution-store";
import { GmailErrorCategory } from "@/lib/gmail/error-map";
import { createProcessingLeaseStore } from "@/lib/sessions/processing-lease-store";
import { PROCESSING_LEASE_STATES } from "@/lib/sessions/processing-lease-policy";
import { SCAN_SOURCES, SCAN_STATES } from "@/lib/scanning/constants";
import { createScanStore } from "@/lib/scanning/scan-store";
import { createUnsubscribeExecutionService } from "@/lib/unsubscribe/execution-service";
import { createUnsubscribeExecutionStore } from "@/lib/unsubscribe/execution-store";
import { createUnsubscribeUsageStore } from "@/lib/unsubscribe/usage-store";
import { createWorkflowService } from "@/lib/workflow/service";
import { WORKFLOW_EXECUTION_STATES } from "@/lib/workflow/constants";
import { createWorkflowStore } from "@/lib/workflow/store";

function createSession(overrides = {}) {
  return {
    accountKey: "account-key",
    email: "user@example.com",
    id: "session-1",
    ...overrides,
  };
}

function createMessage(id, {
  from,
  labelIds = ["INBOX"],
  listId = null,
  listUnsubscribe = null,
  listUnsubscribePost = null,
  source = SCAN_SOURCES.ACTIVE_MAIL,
} = {}) {
  return {
    headers: {
      date: null,
      from,
      listId,
      listUnsubscribe,
      listUnsubscribePost,
      precedence: null,
      replyTo: null,
      sender: null,
      subject: null,
      to: null,
    },
    id,
    internalDate: 1700000000000,
    labelIds,
    source,
    threadId: `thread-${id}`,
  };
}

function seedScan({ messages, processingLeaseStore, scanState = SCAN_STATES.PARTIAL_RESULTS_AVAILABLE, scanStore, session }) {
  const lease = processingLeaseStore.acquireLease({ sessionId: session.id });
  const scan = scanStore.createSessionScan({
    accountKey: session.accountKey,
    leaseId: lease.id,
    metadataConcurrency: 2,
    pageSize: 50,
    sessionId: session.id,
  });

  scanStore.beginSourcePage(scan.id, {
    messageRefs: messages.map((message) => ({ id: message.id })),
    nextPageToken: null,
    source: SCAN_SOURCES.ACTIVE_MAIL,
  });
  scanStore.commitSourcePageProgress(scan.id, {
    metadataFailures: 0,
    normalizedMessages: messages,
    remainingPendingMessageIds: [],
    source: SCAN_SOURCES.ACTIVE_MAIL,
  });
  scanStore.transitionScanState(scan.id, scanState, {
    failure: null,
    pauseReason: null,
  });

  return {
    lease,
    scan,
  };
}

function discoverMessages({ messages, scanId, scanState = SCAN_STATES.PARTIAL_RESULTS_AVAILABLE, scanStore }) {
  scanStore.beginSourcePage(scanId, {
    messageRefs: messages.map((message) => ({ id: message.id })),
    nextPageToken: null,
    source: SCAN_SOURCES.ACTIVE_MAIL,
  });
  scanStore.commitSourcePageProgress(scanId, {
    metadataFailures: 0,
    normalizedMessages: messages,
    remainingPendingMessageIds: [],
    source: SCAN_SOURCES.ACTIVE_MAIL,
  });
  scanStore.transitionScanState(scanId, scanState, {
    failure: null,
    pauseReason: null,
  });
}

function createWorkflowHarness({
  gmailTrash = vi.fn(async ({ messageId }) => ({ id: messageId, labelIds: ["TRASH"] })),
  session = createSession(),
  transportExecute = vi.fn(async (operation) => ({
    completedAt: Date.now(),
    operationId: operation.id,
    operationType: operation.type,
    status: "SUCCESS",
  })),
} = {}) {
  const cleanupExecutionStore = createCleanupExecutionStore();
  const processingLeaseStore = createProcessingLeaseStore({ ttlMs: 60_000 });
  const scanStore = createScanStore();
  const unsubscribeExecutionStore = createUnsubscribeExecutionStore();
  const unsubscribeUsageStore = createUnsubscribeUsageStore();
  const workflowStore = createWorkflowStore();
  const cleanupExecutionService = createCleanupExecutionService({
    config: { cleanupMutationConcurrency: 1 },
    executionStore: cleanupExecutionStore,
    gmailClient: { trashMessage: gmailTrash },
    processingLeaseStore,
    scanStore,
  });
  const unsubscribeExecutionService = createUnsubscribeExecutionService({
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
    executionStore: unsubscribeExecutionStore,
    processingLeaseStore,
    scanStore,
    transport: { executeOperation: transportExecute },
    usageStore: unsubscribeUsageStore,
  });
  const workflowService = createWorkflowService({
    cleanupExecutionService,
    cleanupExecutionStore,
    processingLeaseStore,
    scanService: {
      getScanStatus: ({ session: currentSession }) => scanStore.getSanitizedScanForSession(currentSession.id),
    },
    scanStore,
    unsubscribeExecutionService,
    unsubscribeExecutionStore,
    workflowStore,
  });

  return {
    cleanupExecutionService,
    cleanupExecutionStore,
    gmailTrash,
    processingLeaseStore,
    scanStore,
    session,
    transportExecute,
    unsubscribeExecutionService,
    unsubscribeExecutionStore,
    unsubscribeUsageStore,
    workflowService,
    workflowStore,
  };
}

describe("workflow service", () => {
  it("keeps cleanup completed while scan is partial when currently known eligible work is exhausted", async () => {
    const harness = createWorkflowHarness();
    const { scan } = seedScan({
      messages: Array.from({ length: 5 }, (_, index) => createMessage(`m-${index + 1}`, {
        from: "Alerts <alerts@example.com>",
        labelIds: ["UNREAD", "INBOX"],
      })),
      processingLeaseStore: harness.processingLeaseStore,
      scanState: SCAN_STATES.PARTIAL_RESULTS_AVAILABLE,
      scanStore: harness.scanStore,
      session: harness.session,
    });
    const senderGroupId = harness.workflowService.getWorkflowStatus({ session: harness.session }).scan.senderGroups[0].id;

    await harness.workflowService.executeSelections({
      selections: [{
        actions: { cleanup: true },
        senderGroupId,
      }],
      session: harness.session,
    });

    const workflow = harness.workflowService.getWorkflowStatus({ session: harness.session });
    const senderGroup = workflow.scan.senderGroups[0];

    expect(scan.id).toBeTruthy();
    expect(workflow.scan.state).toBe(SCAN_STATES.PARTIAL_RESULTS_AVAILABLE);
    expect(senderGroup.workflow.cleanupEligibleCount).toBe(0);
    expect(senderGroup.workflow.cleanupExecution.state).toBe(WORKFLOW_EXECUTION_STATES.COMPLETED);
    expect(senderGroup.workflow.cleanupExecution.execution.summary).toEqual(expect.objectContaining({
      remainingEligibleCount: 0,
      successfulCount: 5,
      totalEligibleCount: 5,
    }));
  });

  it("reconciles stale cleanup completion when partial scan later discovers newly eligible messages", async () => {
    const harness = createWorkflowHarness();
    const { scan } = seedScan({
      messages: Array.from({ length: 5 }, (_, index) => createMessage(`m-${index + 1}`, {
        from: "Alerts <alerts@example.com>",
        labelIds: ["UNREAD", "INBOX"],
      })),
      processingLeaseStore: harness.processingLeaseStore,
      scanState: SCAN_STATES.PARTIAL_RESULTS_AVAILABLE,
      scanStore: harness.scanStore,
      session: harness.session,
    });
    const senderGroupId = harness.workflowService.getWorkflowStatus({ session: harness.session }).scan.senderGroups[0].id;

    await harness.workflowService.executeSelections({
      selections: [{
        actions: { cleanup: true },
        senderGroupId,
      }],
      session: harness.session,
    });

    discoverMessages({
      messages: Array.from({ length: 3 }, (_, index) => createMessage(`m-${index + 6}`, {
        from: "Alerts <alerts@example.com>",
        labelIds: ["UNREAD", "INBOX"],
      })),
      scanId: scan.id,
      scanState: SCAN_STATES.PARTIAL_RESULTS_AVAILABLE,
      scanStore: harness.scanStore,
    });

    const workflow = harness.workflowService.getWorkflowStatus({ session: harness.session });
    const senderGroup = workflow.scan.senderGroups[0];

    expect(workflow.scan.state).toBe(SCAN_STATES.PARTIAL_RESULTS_AVAILABLE);
    expect(senderGroup.workflow.cleanupEligibleCount).toBe(3);
    expect(senderGroup.workflow.cleanupExecution.state).toBe(WORKFLOW_EXECUTION_STATES.PARTIAL_SUCCESS);
    expect(senderGroup.workflow.cleanupExecution.execution.summary).toEqual(expect.objectContaining({
      remainingEligibleCount: 3,
      successfulCount: 5,
      totalEligibleCount: 8,
    }));
  });

  it("keeps cleanup completed after scan completes when no newly eligible messages were discovered", async () => {
    const harness = createWorkflowHarness();
    const { scan } = seedScan({
      messages: Array.from({ length: 5 }, (_, index) => createMessage(`m-${index + 1}`, {
        from: "Alerts <alerts@example.com>",
        labelIds: ["UNREAD", "INBOX"],
      })),
      processingLeaseStore: harness.processingLeaseStore,
      scanState: SCAN_STATES.PARTIAL_RESULTS_AVAILABLE,
      scanStore: harness.scanStore,
      session: harness.session,
    });
    const senderGroupId = harness.workflowService.getWorkflowStatus({ session: harness.session }).scan.senderGroups[0].id;

    await harness.workflowService.executeSelections({
      selections: [{
        actions: { cleanup: true },
        senderGroupId,
      }],
      session: harness.session,
    });

    harness.scanStore.transitionScanState(scan.id, SCAN_STATES.COMPLETE, {
      failure: null,
      pauseReason: null,
    });

    const workflow = harness.workflowService.getWorkflowStatus({ session: harness.session });
    const senderGroup = workflow.scan.senderGroups[0];

    expect(workflow.scan.state).toBe(SCAN_STATES.COMPLETE);
    expect(senderGroup.workflow.cleanupEligibleCount).toBe(0);
    expect(senderGroup.workflow.cleanupExecution.state).toBe(WORKFLOW_EXECUTION_STATES.COMPLETED);
  });

  it("reflects remaining cleanup work after scan completes with newly discovered eligible messages", async () => {
    const harness = createWorkflowHarness();
    const { scan } = seedScan({
      messages: Array.from({ length: 5 }, (_, index) => createMessage(`m-${index + 1}`, {
        from: "Alerts <alerts@example.com>",
        labelIds: ["UNREAD", "INBOX"],
      })),
      processingLeaseStore: harness.processingLeaseStore,
      scanState: SCAN_STATES.PARTIAL_RESULTS_AVAILABLE,
      scanStore: harness.scanStore,
      session: harness.session,
    });
    const senderGroupId = harness.workflowService.getWorkflowStatus({ session: harness.session }).scan.senderGroups[0].id;

    await harness.workflowService.executeSelections({
      selections: [{
        actions: { cleanup: true },
        senderGroupId,
      }],
      session: harness.session,
    });

    discoverMessages({
      messages: Array.from({ length: 3 }, (_, index) => createMessage(`m-${index + 6}`, {
        from: "Alerts <alerts@example.com>",
        labelIds: ["UNREAD", "INBOX"],
      })),
      scanId: scan.id,
      scanState: SCAN_STATES.COMPLETE,
      scanStore: harness.scanStore,
    });

    const workflow = harness.workflowService.getWorkflowStatus({ session: harness.session });
    const senderGroup = workflow.scan.senderGroups[0];

    expect(workflow.scan.state).toBe(SCAN_STATES.COMPLETE);
    expect(senderGroup.workflow.cleanupEligibleCount).toBe(3);
    expect(senderGroup.workflow.cleanupExecution.state).toBe(WORKFLOW_EXECUTION_STATES.PARTIAL_SUCCESS);
    expect(senderGroup.workflow.cleanupExecution.execution.summary).toEqual(expect.objectContaining({
      remainingEligibleCount: 3,
      successfulCount: 5,
      totalEligibleCount: 8,
    }));
  });

  it("returns deterministic workflow status reads without mutating cleanup execution state", async () => {
    const harness = createWorkflowHarness();
    const { scan } = seedScan({
      messages: Array.from({ length: 5 }, (_, index) => createMessage(`m-${index + 1}`, {
        from: "Alerts <alerts@example.com>",
        labelIds: ["UNREAD", "INBOX"],
      })),
      processingLeaseStore: harness.processingLeaseStore,
      scanState: SCAN_STATES.PARTIAL_RESULTS_AVAILABLE,
      scanStore: harness.scanStore,
      session: harness.session,
    });
    const senderGroupId = harness.workflowService.getWorkflowStatus({ session: harness.session }).scan.senderGroups[0].id;

    await harness.workflowService.executeSelections({
      selections: [{
        actions: { cleanup: true },
        senderGroupId,
      }],
      session: harness.session,
    });

    discoverMessages({
      messages: [createMessage("m-6", {
        from: "Alerts <alerts@example.com>",
        labelIds: ["UNREAD", "INBOX"],
      })],
      scanId: scan.id,
      scanState: SCAN_STATES.PARTIAL_RESULTS_AVAILABLE,
      scanStore: harness.scanStore,
    });

    const storedBefore = structuredClone(harness.workflowStore.getActionState({
      actionType: "CLEANUP",
      senderGroupId,
      sessionId: harness.session.id,
    }));
    const firstRead = harness.workflowService.getWorkflowStatus({ session: harness.session });
    const secondRead = harness.workflowService.getWorkflowStatus({ session: harness.session });
    const storedAfter = structuredClone(harness.workflowStore.getActionState({
      actionType: "CLEANUP",
      senderGroupId,
      sessionId: harness.session.id,
    }));

    expect(firstRead).toEqual(secondRead);
    expect(storedAfter).toEqual(storedBefore);
    expect(firstRead.scan.senderGroups[0].workflow.cleanupExecution.state).toBe(WORKFLOW_EXECUTION_STATES.PARTIAL_SUCCESS);
  });

  it("exposes discovered sender groups incrementally while scan is incomplete", () => {
    const harness = createWorkflowHarness();

    seedScan({
      messages: [
        createMessage("m-1", {
          from: "Alerts <alerts@example.com>",
          labelIds: ["UNREAD", "INBOX"],
          listUnsubscribe: "<https://public.example/unsub?id=1>",
          listUnsubscribePost: "List-Unsubscribe=One-Click",
        }),
      ],
      processingLeaseStore: harness.processingLeaseStore,
      scanState: SCAN_STATES.PARTIAL_RESULTS_AVAILABLE,
      scanStore: harness.scanStore,
      session: harness.session,
    });

    const workflow = harness.workflowService.getWorkflowStatus({ session: harness.session });

    expect(workflow.processing.scanState).toBe(SCAN_STATES.PARTIAL_RESULTS_AVAILABLE);
    expect(workflow.scan.senderGroups).toEqual([
      expect.objectContaining({
        representativeAddress: "alerts@example.com",
        workflow: expect.objectContaining({
          classificationAvailable: true,
          cleanupEligibleCount: 1,
          discovered: true,
          unsubscribeExecution: expect.objectContaining({ state: WORKFLOW_EXECUTION_STATES.NOT_STARTED }),
          unsubscribeOperationsAvailable: true,
        }),
      }),
    ]);
    expect(workflow.usage).toEqual({
      automaticUnsubscribe: expect.objectContaining({
        limit: 5000,
        remainingCount: 5000,
        successfulCount: 0,
        state: "AVAILABLE",
      }),
    });
  });

  it("executes cleanup and unsubscribe by sender-group selection across multiple groups and reuses underlying idempotency", async () => {
    const harness = createWorkflowHarness();

    seedScan({
      messages: [
        createMessage("m-1", {
          from: "Alerts <alerts@example.com>",
          labelIds: ["UNREAD", "INBOX"],
          listUnsubscribe: "<https://public.example/unsub?id=1>",
          listUnsubscribePost: "List-Unsubscribe=One-Click",
        }),
        createMessage("m-2", {
          from: "Receipts <receipts@example.com>",
          labelIds: ["UNREAD", "INBOX"],
        }),
      ],
      processingLeaseStore: harness.processingLeaseStore,
      scanStore: harness.scanStore,
      session: harness.session,
    });

    const senderGroups = harness.workflowService.getWorkflowStatus({ session: harness.session }).scan.senderGroups;
    const alertsGroup = senderGroups.find((group) => group.representativeAddress === "alerts@example.com");
    const receiptsGroup = senderGroups.find((group) => group.representativeAddress === "receipts@example.com");

    const firstRun = await harness.workflowService.executeSelections({
      selections: [
        {
          actions: { cleanup: true, unsubscribe: true },
          senderGroupId: alertsGroup.id,
        },
        {
          actions: { cleanup: true },
          senderGroupId: receiptsGroup.id,
        },
      ],
      session: harness.session,
    });
    await harness.workflowService.executeSelections({
      selections: [{
        actions: { cleanup: true, unsubscribe: true },
        senderGroupId: alertsGroup.id,
      }],
      session: harness.session,
    });

    expect(firstRun.actionResults).toEqual(expect.arrayContaining([
      expect.objectContaining({ senderGroupId: alertsGroup.id }),
      expect.objectContaining({ senderGroupId: receiptsGroup.id }),
    ]));
    expect(harness.gmailTrash).toHaveBeenCalledTimes(2);
    expect(harness.transportExecute).toHaveBeenCalledTimes(1);

    const updatedWorkflow = harness.workflowService.getWorkflowStatus({ session: harness.session });
    const updatedAlertsGroup = updatedWorkflow.scan.senderGroups.find((group) => group.id === alertsGroup.id);
    const updatedReceiptsGroup = updatedWorkflow.scan.senderGroups.find((group) => group.id === receiptsGroup.id);

    expect(updatedAlertsGroup.workflow.cleanupExecution.state).toBe(WORKFLOW_EXECUTION_STATES.COMPLETED);
    expect(updatedAlertsGroup.workflow.unsubscribeExecution.state).toBe(WORKFLOW_EXECUTION_STATES.COMPLETED);
    expect(updatedAlertsGroup.workflow.cleanupEligibleCount).toBe(0);
    expect(updatedReceiptsGroup.workflow.cleanupExecution.state).toBe(WORKFLOW_EXECUTION_STATES.COMPLETED);
  });

  it("shows RUNNING during in-flight work and preserves scan/execution coexistence", async () => {
    const deferred = Promise.withResolvers();
    const cleanupExecutionService = {
      executeSenderGroupCleanup: vi.fn(async () => {
        await deferred.promise;

        return {
          senderGroupId: "sg_1",
          status: "ALL_SUCCEEDED",
          summary: {
            alreadyCompletedCount: 0,
            completedCount: 1,
            failedCount: 0,
            leaseExpiredCount: 0,
            pausedCount: 0,
            permanentFailureCount: 0,
            reauthRequiredCount: 0,
            remainingEligibleCount: 0,
            retryableFailureCount: 0,
            successfulCount: 1,
            totalEligibleCount: 1,
          },
        };
      }),
    };
    const scanStore = createScanStore();
    const processingLeaseStore = createProcessingLeaseStore({ ttlMs: 60_000 });
    const workflowStore = createWorkflowStore();
    const session = createSession();

    seedScan({
      messages: [createMessage("m-1", {
        from: "Alerts <alerts@example.com>",
        labelIds: ["UNREAD", "INBOX"],
      })],
      processingLeaseStore,
      scanStore,
      session,
    });

    const workflowService = createWorkflowService({
      cleanupExecutionService,
      cleanupExecutionStore: createCleanupExecutionStore(),
      processingLeaseStore,
      scanService: {
        getScanStatus: ({ session: currentSession }) => scanStore.getSanitizedScanForSession(currentSession.id),
      },
      scanStore,
      unsubscribeExecutionService: {
        executeSenderGroup: vi.fn(),
      },
      unsubscribeExecutionStore: createUnsubscribeExecutionStore(),
      workflowStore,
    });
    const senderGroupId = workflowService.getWorkflowStatus({ session }).scan.senderGroups[0].id;

    const executionPromise = workflowService.executeSelections({
      selections: [{
        actions: { cleanup: true },
        senderGroupId,
      }],
      session,
    });

    expect(workflowService.getWorkflowStatus({ session }).scan.senderGroups[0].workflow.cleanupExecution.state).toBe(
      WORKFLOW_EXECUTION_STATES.RUNNING,
    );
    expect(workflowService.getWorkflowStatus({ session }).processing.scanState).toBe(SCAN_STATES.PARTIAL_RESULTS_AVAILABLE);

    deferred.resolve();
    await executionPromise;
  });

  it("surfaces manual, paused, failed, and reauth-required states without expanding trust boundaries", async () => {
    const harness = createWorkflowHarness({
      gmailTrash: vi.fn(async () => {
        const error = new Error("reauth");
        error.category = GmailErrorCategory.INVALID_REVOKED_CREDENTIAL;
        throw error;
      }),
      transportExecute: vi.fn(async () => ({
        completedAt: Date.now(),
        operationId: "uo_1",
        operationType: "RFC8058_ONE_CLICK",
        status: "FAILED_PERMANENT",
      })),
    });

    seedScan({
      messages: [
        createMessage("m-1", {
          from: "Manual <manual@example.com>",
          labelIds: ["UNREAD", "INBOX"],
          listUnsubscribe: "<mailto:leave@example.com>",
        }),
        createMessage("m-2", {
          from: "Auto <auto@example.com>",
          labelIds: ["UNREAD", "INBOX"],
          listUnsubscribe: "<https://public.example/unsub?id=2>",
          listUnsubscribePost: "List-Unsubscribe=One-Click",
        }),
      ],
      processingLeaseStore: harness.processingLeaseStore,
      scanStore: harness.scanStore,
      session: harness.session,
    });

    const groups = harness.workflowService.getWorkflowStatus({ session: harness.session }).scan.senderGroups;
    const manualGroup = groups.find((group) => group.representativeAddress === "manual@example.com");
    const autoGroup = groups.find((group) => group.representativeAddress === "auto@example.com");

    harness.processingLeaseStore.pauseLease({
      leaseId: harness.scanStore.getScanForSession(harness.session.id).leaseId,
      sessionId: harness.session.id,
    });
    harness.scanStore.pauseScan(harness.scanStore.getScanForSession(harness.session.id).id, "USER_REQUESTED");

    await harness.workflowService.executeSelections({
      selections: [{
        actions: { cleanup: true },
        senderGroupId: autoGroup.id,
      }],
      session: harness.session,
    });
    await harness.workflowService.executeSelections({
      selections: [{
        actions: { unsubscribe: true },
        senderGroupId: manualGroup.id,
      }],
      session: harness.session,
    });

    harness.processingLeaseStore.resumeLease({
      leaseId: harness.scanStore.getScanForSession(harness.session.id).leaseId,
      sessionId: harness.session.id,
    });
    harness.scanStore.transitionScanState(harness.scanStore.getScanForSession(harness.session.id).id, SCAN_STATES.PARTIAL_RESULTS_AVAILABLE, {
      failure: null,
      pauseReason: null,
    });

    await harness.workflowService.executeSelections({
      selections: [{
        actions: { cleanup: true, unsubscribe: true },
        senderGroupId: autoGroup.id,
      }],
      session: harness.session,
    });

    const updatedGroups = harness.workflowService.getWorkflowStatus({ session: harness.session }).scan.senderGroups;
    const updatedManualGroup = updatedGroups.find((group) => group.id === manualGroup.id);
    const updatedAutoGroup = updatedGroups.find((group) => group.id === autoGroup.id);

    expect(updatedManualGroup.workflow.unsubscribeExecution.state).toBe(WORKFLOW_EXECUTION_STATES.MANUAL_ACTION_REQUIRED);
    expect(updatedAutoGroup.workflow.cleanupExecution.state).toBe(WORKFLOW_EXECUTION_STATES.REAUTH_REQUIRED);
    expect(updatedAutoGroup.workflow.unsubscribeExecution.state).toBe(WORKFLOW_EXECUTION_STATES.FAILED);
  });

  it("rejects foreign sender-group ids across sessions", async () => {
    const harness = createWorkflowHarness();
    const sessionA = createSession({ id: "session-a" });
    const sessionB = createSession({ id: "session-b" });

    seedScan({
      messages: [createMessage("m-1", { from: "Alerts <alerts@example.com>", labelIds: ["UNREAD", "INBOX"] })],
      processingLeaseStore: harness.processingLeaseStore,
      scanStore: harness.scanStore,
      session: sessionA,
    });

    const senderGroupId = harness.workflowService.getWorkflowStatus({ session: sessionA }).scan.senderGroups[0].id;

    await expect(harness.workflowService.executeSelections({
      selections: [{
        actions: { cleanup: true },
        senderGroupId,
      }],
      session: sessionB,
    })).rejects.toMatchObject({ code: "workflow_sender_group_not_found" });
  });

  it("exposes sanitized manual unsubscribe operations without marking them executable", () => {
    const harness = createWorkflowHarness();

    seedScan({
      messages: [
        createMessage("m-manual", {
          from: "Manual <manual@example.com>",
          labelIds: ["INBOX"],
          listUnsubscribe: "<mailto:leave@example.com>",
        }),
        createMessage("m-page", {
          from: "Page <page@example.com>",
          labelIds: ["INBOX"],
          listUnsubscribe: "<https://public.example/leave>",
        }),
      ],
      processingLeaseStore: harness.processingLeaseStore,
      scanStore: harness.scanStore,
      session: harness.session,
    });

    const groups = harness.workflowService.getWorkflowStatus({ session: harness.session }).scan.senderGroups;
    const manualGroup = groups.find((group) => group.representativeAddress === "manual@example.com");
    const pageGroup = groups.find((group) => group.representativeAddress === "page@example.com");

    expect(manualGroup.workflow.unsubscribeOperationsAvailable).toBe(false);
    expect(manualGroup.workflow.unsubscribeAutomaticOperationCount).toBe(0);
    expect(manualGroup.workflow.manualUnsubscribeOperations).toEqual([
      expect.objectContaining({
        mailto: expect.objectContaining({
          recipient: "leave@example.com",
        }),
        status: "MANUAL_ACTION_REQUIRED",
        type: "MAILTO",
      }),
    ]);
    expect(manualGroup.workflow.manualUnsubscribeOperations[0].mailto).not.toHaveProperty("body");

    expect(pageGroup.workflow.unsubscribeOperationsAvailable).toBe(false);
    expect(pageGroup.workflow.unsubscribeAutomaticOperationCount).toBe(0);
    expect(pageGroup.workflow.manualUnsubscribeOperations).toEqual([
      expect.objectContaining({
        host: "public.example",
        path: "/leave",
        status: "MANUAL_ACTION_REQUIRED",
        target: "https://public.example/leave",
        type: "HTTPS_LINK",
      }),
    ]);
  });
});