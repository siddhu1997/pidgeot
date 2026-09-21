import {
  CLEANUP_EXECUTION_GROUP_STATUSES,
  CLEANUP_EXECUTION_RESULT_STATUSES,
} from "@/lib/cleanup/constants";
import { getServerAppConfig } from "@/lib/config";
import { SCAN_STATES } from "@/lib/scanning/constants";
import { getScanStore } from "@/lib/scanning/scan-store";
import { getProcessingLeaseStore } from "@/lib/sessions/processing-lease-store";
import {
  UNSUBSCRIBE_EXECUTION_GROUP_STATUSES,
  UNSUBSCRIBE_EXECUTION_RESULT_STATUSES,
  UNSUBSCRIBE_OPERATION_STATUSES,
  UNSUBSCRIBE_OPERATION_TYPES,
} from "@/lib/unsubscribe/constants";
import { getCleanupExecutionStore } from "@/lib/cleanup/execution-store";
import { getUnsubscribeExecutionStore } from "@/lib/unsubscribe/execution-store";
import {
  WORKFLOW_ACTION_TYPES,
  WORKFLOW_BLOCKING_REASONS,
  WORKFLOW_EXECUTION_PROGRESS_PHASES,
  WORKFLOW_EXECUTION_STATES,
} from "@/lib/workflow/constants";
import { getWorkflowStore } from "@/lib/workflow/store";

const SIMULATED_QUEUE_DELAY_MS = 180;
const SIMULATED_CLEANUP_STEP_DELAY_MS = 90;
const SIMULATED_UNSUBSCRIBE_STEP_DELAY_MS = 180;

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function buildCleanupMessageResult(messageId, status) {
  return {
    completedAt: Date.now(),
    messageId,
    status,
  };
}

function buildUnsubscribeOperationResult(operation, status) {
  return {
    completedAt: Date.now(),
    operationId: operation.id,
    operationType: operation.type,
    status,
  };
}

function summarizeCleanupExecution({ attemptedResults, totalEligibleCount }) {
  const successfulCount = attemptedResults.filter((result) => result.status === CLEANUP_EXECUTION_RESULT_STATUSES.SUCCESS).length;
  const alreadyCompletedCount = attemptedResults.filter((result) => result.status === CLEANUP_EXECUTION_RESULT_STATUSES.ALREADY_COMPLETED).length;
  const pausedCount = attemptedResults.filter((result) => result.status === CLEANUP_EXECUTION_RESULT_STATUSES.PAUSED).length;
  const leaseExpiredCount = attemptedResults.filter((result) => result.status === CLEANUP_EXECUTION_RESULT_STATUSES.LEASE_EXPIRED).length;
  const retryableFailureCount = attemptedResults.filter((result) => result.status === CLEANUP_EXECUTION_RESULT_STATUSES.FAILED_RETRYABLE).length;
  const permanentFailureCount = attemptedResults.filter((result) => result.status === CLEANUP_EXECUTION_RESULT_STATUSES.FAILED_PERMANENT).length;
  const reauthRequiredCount = attemptedResults.filter((result) => result.status === CLEANUP_EXECUTION_RESULT_STATUSES.REAUTH_REQUIRED).length;
  const completedCount = successfulCount + alreadyCompletedCount;
  const failedCount = retryableFailureCount + permanentFailureCount + reauthRequiredCount + pausedCount + leaseExpiredCount;
  const remainingEligibleCount = Math.max(0, totalEligibleCount - successfulCount);

  let status = CLEANUP_EXECUTION_GROUP_STATUSES.NONE_SUCCEEDED;

  if (remainingEligibleCount === 0 && totalEligibleCount > 0) {
    status = CLEANUP_EXECUTION_GROUP_STATUSES.ALL_SUCCEEDED;
  } else if (successfulCount > 0) {
    status = CLEANUP_EXECUTION_GROUP_STATUSES.PARTIAL_SUCCESS;
  }

  return {
    status,
    summary: {
      alreadyCompletedCount,
      completedCount,
      failedCount,
      leaseExpiredCount,
      permanentFailureCount,
      pausedCount,
      reauthRequiredCount,
      remainingEligibleCount,
      retryableFailureCount,
      successfulCount,
      totalEligibleCount,
    },
  };
}

function summarizeUnsubscribeExecution(operationResults) {
  const successfulCount = operationResults.filter((result) => result.status === UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.SUCCESS).length;
  const alreadyCompletedCount = operationResults.filter((result) => result.status === UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.ALREADY_COMPLETED).length;
  const manualCount = operationResults.filter((result) => result.status === UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.MANUAL_ACTION_REQUIRED).length;
  const completedSuccessCount = successfulCount + alreadyCompletedCount;

  let status = UNSUBSCRIBE_EXECUTION_GROUP_STATUSES.NONE_SUCCEEDED;

  if (operationResults.length === 0 || (completedSuccessCount === 0 && manualCount === operationResults.length)) {
    status = UNSUBSCRIBE_EXECUTION_GROUP_STATUSES.MANUAL_ACTION_REQUIRED;
  } else if (completedSuccessCount === operationResults.length) {
    status = UNSUBSCRIBE_EXECUTION_GROUP_STATUSES.ALL_SUCCEEDED;
  } else if (completedSuccessCount > 0) {
    status = UNSUBSCRIBE_EXECUTION_GROUP_STATUSES.PARTIAL_SUCCESS;
  }

  return {
    operationResults: [...operationResults].sort((left, right) => left.operationId.localeCompare(right.operationId)),
    status,
    summary: {
      alreadyCompletedCount,
      manualCount,
      successfulCount,
      totalOperationCount: operationResults.length,
    },
  };
}

function partitionOperations(operations) {
  const executable = [];
  const manual = [];

  for (const operation of operations) {
    if (
      operation.type === UNSUBSCRIBE_OPERATION_TYPES.RFC8058_ONE_CLICK &&
      operation.status === UNSUBSCRIBE_OPERATION_STATUSES.AUTOMATIC
    ) {
      executable.push(operation);
      continue;
    }

    manual.push(operation);
  }

  return { executable, manual };
}

function deriveCleanupStateFromExecution(cleanupExecution) {
  const summary = cleanupExecution?.summary || null;
  const blockedByPause = (summary?.pausedCount || 0) > 0;
  const blockedByLeaseExpiry = (summary?.leaseExpiredCount || 0) > 0;
  const successfulCount = summary?.successfulCount || 0;
  const completedCount = summary?.completedCount || 0;
  const reauthRequiredCount = summary?.reauthRequiredCount || 0;
  const permanentFailureCount = summary?.permanentFailureCount || 0;
  const retryableFailureCount = summary?.retryableFailureCount || 0;

  let state = WORKFLOW_EXECUTION_STATES.NOT_STARTED;
  let blockingReason = null;

  if (blockedByPause || blockedByLeaseExpiry) {
    state = successfulCount > 0
      ? WORKFLOW_EXECUTION_STATES.PARTIAL_SUCCESS
      : WORKFLOW_EXECUTION_STATES.PAUSED;
    blockingReason = blockedByPause
      ? WORKFLOW_BLOCKING_REASONS.PAUSED
      : WORKFLOW_BLOCKING_REASONS.LEASE_EXPIRED;
  } else if (successfulCount > 0 && (summary?.remainingEligibleCount || 0) === 0 && (summary?.failedCount || 0) === 0) {
    state = WORKFLOW_EXECUTION_STATES.COMPLETED;
  } else if (successfulCount > 0) {
    state = WORKFLOW_EXECUTION_STATES.PARTIAL_SUCCESS;
  } else if (reauthRequiredCount > 0 && completedCount === 0) {
    state = WORKFLOW_EXECUTION_STATES.REAUTH_REQUIRED;
  } else if (reauthRequiredCount > 0 || permanentFailureCount > 0 || retryableFailureCount > 0) {
    state = WORKFLOW_EXECUTION_STATES.FAILED;
  } else if ((summary?.totalEligibleCount || 0) === 0) {
    state = WORKFLOW_EXECUTION_STATES.COMPLETED;
  }

  return {
    blockingReason,
    execution: cleanupExecution,
    phase: null,
    state,
  };
}

function deriveUnsubscribeStateFromExecution(unsubscribeExecution) {
  const operationResults = unsubscribeExecution?.operationResults || [];
  const successfulCount = operationResults.filter((result) => result.status === UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.SUCCESS).length
    + operationResults.filter((result) => result.status === UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.ALREADY_COMPLETED).length;
  const manualCount = operationResults.filter((result) => result.status === UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.MANUAL_ACTION_REQUIRED).length;
  const pausedCount = operationResults.filter((result) => result.status === UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.PAUSED).length;
  const leaseExpiredCount = operationResults.filter((result) => result.status === UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.LEASE_EXPIRED).length;
  const usageLimitCount = operationResults.filter((result) => result.status === UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.USAGE_LIMIT_REACHED).length;
  const failedCount = operationResults.filter((result) => result.status === UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.FAILED_PERMANENT).length
    + operationResults.filter((result) => result.status === UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.FAILED_RETRYABLE).length
    + operationResults.filter((result) => result.status === UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.UNSAFE_TARGET).length
    + usageLimitCount;

  let state = WORKFLOW_EXECUTION_STATES.NOT_STARTED;
  let blockingReason = null;

  if (manualCount === operationResults.length && operationResults.length > 0) {
    state = WORKFLOW_EXECUTION_STATES.MANUAL_ACTION_REQUIRED;
  } else if (pausedCount > 0 || leaseExpiredCount > 0) {
    state = successfulCount > 0
      ? WORKFLOW_EXECUTION_STATES.PARTIAL_SUCCESS
      : WORKFLOW_EXECUTION_STATES.PAUSED;
    blockingReason = pausedCount > 0
      ? WORKFLOW_BLOCKING_REASONS.PAUSED
      : WORKFLOW_BLOCKING_REASONS.LEASE_EXPIRED;
  } else if (usageLimitCount > 0) {
    state = successfulCount > 0
      ? WORKFLOW_EXECUTION_STATES.PARTIAL_SUCCESS
      : WORKFLOW_EXECUTION_STATES.FAILED;
    blockingReason = WORKFLOW_BLOCKING_REASONS.USAGE_LIMIT_REACHED;
  } else if (successfulCount > 0 && failedCount === 0 && successfulCount + manualCount === operationResults.length) {
    state = manualCount > 0
      ? WORKFLOW_EXECUTION_STATES.PARTIAL_SUCCESS
      : WORKFLOW_EXECUTION_STATES.COMPLETED;
  } else if (successfulCount > 0) {
    state = WORKFLOW_EXECUTION_STATES.PARTIAL_SUCCESS;
  } else if (failedCount > 0) {
    state = WORKFLOW_EXECUTION_STATES.FAILED;
  }

  return {
    blockingReason,
    execution: unsubscribeExecution,
    phase: null,
    state,
  };
}

export function createWorkflowSimulationService({
  cleanupExecutionStore = getCleanupExecutionStore(),
  config = getServerAppConfig(),
  now = () => Date.now(),
  processingLeaseStore = getProcessingLeaseStore(config),
  scanStore = getScanStore(config),
  unsubscribeExecutionStore = getUnsubscribeExecutionStore(),
  workflowStore = getWorkflowStore(),
} = {}) {
  const activeJobsBySessionId = new Map();
  const handledUnsubscribeGroupsBySessionId = new Map();
  const sessionVersions = new Map();

  function getSessionVersion(sessionId) {
    return sessionVersions.get(sessionId) || 0;
  }

  function bumpSessionVersion(sessionId) {
    const nextVersion = getSessionVersion(sessionId) + 1;
    sessionVersions.set(sessionId, nextVersion);
    return nextVersion;
  }

  function isCurrentSessionVersion(sessionId, version) {
    return getSessionVersion(sessionId) === version;
  }

  function getHandledGroupSet(sessionId) {
    if (handledUnsubscribeGroupsBySessionId.has(sessionId)) {
      return handledUnsubscribeGroupsBySessionId.get(sessionId);
    }

    const nextSet = new Set();
    handledUnsubscribeGroupsBySessionId.set(sessionId, nextSet);
    return nextSet;
  }

  function isSenderGroupUnsubscribeHandled({ senderGroupId, sessionId }) {
    return getHandledGroupSet(sessionId).has(senderGroupId);
  }

  function markSenderGroupUnsubscribeHandled({ senderGroupId, sessionId }) {
    getHandledGroupSet(sessionId).add(senderGroupId);
  }

  function resetSession({ sessionId }) {
    bumpSessionVersion(sessionId);
    activeJobsBySessionId.delete(sessionId);
    handledUnsubscribeGroupsBySessionId.delete(sessionId);
    cleanupExecutionStore.clearSession(sessionId);
    unsubscribeExecutionStore.clearSession(sessionId);
    workflowStore.clearSession(sessionId);
  }

  function getBlockedExecution(sessionId, leaseId) {
    const lease = processingLeaseStore.getLease({ leaseId, sessionId });
    const scan = scanStore.getScanForSession(sessionId);
    const paused = scan?.state === SCAN_STATES.PAUSED || lease?.state === "PAUSED";

    if (!paused) {
      return null;
    }

    return {
      blockingReason: paused
        ? WORKFLOW_BLOCKING_REASONS.PAUSED
        : WORKFLOW_BLOCKING_REASONS.LEASE_EXPIRED,
      cleanupStatus: paused
        ? CLEANUP_EXECUTION_RESULT_STATUSES.PAUSED
        : CLEANUP_EXECUTION_RESULT_STATUSES.LEASE_EXPIRED,
      unsubscribeStatus: paused
        ? UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.PAUSED
        : UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.LEASE_EXPIRED,
    };
  }

  function setRunningState({ actionType, queuePosition, queueSize, requestedAt, senderGroupId, sessionId, phase }) {
    workflowStore.setActionState({
      actionType,
      senderGroupId,
      sessionId,
      state: {
        blockingReason: null,
        execution: null,
        phase,
        queuePosition,
        queueSize,
        requestedAt,
        simulated: true,
        state: WORKFLOW_EXECUTION_STATES.RUNNING,
      },
    });
  }

  function setTerminalState({ actionType, requestedAt, senderGroupId, sessionId, snapshot }) {
    workflowStore.setActionState({
      actionType,
      senderGroupId,
      sessionId,
      state: {
        ...snapshot,
        phase: null,
        requestedAt,
        simulated: true,
      },
    });
  }

  async function simulateCleanupAction({ cleanupEligibleMessageIds, leaseId, requestedAt, senderGroupId, sessionId }) {
    const attemptedResults = [];
    const succeededMessageIds = [];
    const totalEligibleCount = cleanupEligibleMessageIds.length;

    for (const messageId of cleanupEligibleMessageIds) {
      const blockedExecution = getBlockedExecution(sessionId, leaseId);

      if (blockedExecution) {
        attemptedResults.push(buildCleanupMessageResult(messageId, blockedExecution.cleanupStatus));
        continue;
      }

      await delay(SIMULATED_CLEANUP_STEP_DELAY_MS);

      const blockedAfterDelay = getBlockedExecution(sessionId, leaseId);

      if (blockedAfterDelay) {
        attemptedResults.push(buildCleanupMessageResult(messageId, blockedAfterDelay.cleanupStatus));
        continue;
      }

      attemptedResults.push(buildCleanupMessageResult(messageId, CLEANUP_EXECUTION_RESULT_STATUSES.SUCCESS));
      succeededMessageIds.push(messageId);
    }

    if (succeededMessageIds.length > 0) {
      scanStore.applyCleanupTrashMutationsForSession(sessionId, succeededMessageIds);
    }

    const cleanupExecution = {
      senderGroupId,
      ...summarizeCleanupExecution({
        attemptedResults,
        totalEligibleCount,
      }),
    };

    return {
      execution: cleanupExecution,
      snapshot: deriveCleanupStateFromExecution(cleanupExecution),
    };
  }

  async function simulateUnsubscribeAction({ leaseId, operations, requestedAt, senderGroupId, sessionId }) {
    const { executable, manual } = partitionOperations(operations);
    const operationResults = manual.map((operation) => buildUnsubscribeOperationResult(
      operation,
      UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.MANUAL_ACTION_REQUIRED,
    ));

    if (operations.length > 0) {
      await delay(SIMULATED_UNSUBSCRIBE_STEP_DELAY_MS);
    }

    for (const operation of executable) {
      const blockedExecution = getBlockedExecution(sessionId, leaseId);

      if (blockedExecution) {
        operationResults.push(buildUnsubscribeOperationResult(operation, blockedExecution.unsubscribeStatus));
        continue;
      }

      await delay(SIMULATED_UNSUBSCRIBE_STEP_DELAY_MS);

      const blockedAfterDelay = getBlockedExecution(sessionId, leaseId);

      if (blockedAfterDelay) {
        operationResults.push(buildUnsubscribeOperationResult(operation, blockedAfterDelay.unsubscribeStatus));
        continue;
      }

      operationResults.push(buildUnsubscribeOperationResult(operation, UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.SUCCESS));
    }

    const unsubscribeExecution = {
      senderGroupId,
      ...summarizeUnsubscribeExecution(operationResults),
    };
    const snapshot = deriveUnsubscribeStateFromExecution(unsubscribeExecution);

    if (
      !snapshot.blockingReason &&
      operationResults.some((result) => (
        result.status === UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.SUCCESS ||
        result.status === UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.ALREADY_COMPLETED
      ))
    ) {
      markSenderGroupUnsubscribeHandled({ senderGroupId, sessionId });
    }

    return {
      execution: unsubscribeExecution,
      snapshot,
    };
  }

  async function runSelectionQueue({ selectionQueue, session, version }) {
    for (const entry of selectionQueue) {
      if (!isCurrentSessionVersion(session.id, version)) {
        return;
      }

      setRunningState({
        actionType: entry.actionType,
        phase: WORKFLOW_EXECUTION_PROGRESS_PHASES.PROCESSING,
        queuePosition: entry.queuePosition,
        queueSize: entry.queueSize,
        requestedAt: entry.requestedAt,
        senderGroupId: entry.senderGroupId,
        sessionId: session.id,
      });

      const workflowContext = scanStore.getSenderGroupWorkflowContextForSession(session.id, entry.senderGroupId);

      if (!workflowContext) {
        setTerminalState({
          actionType: entry.actionType,
          requestedAt: entry.requestedAt,
          senderGroupId: entry.senderGroupId,
          sessionId: session.id,
          snapshot: {
            blockingReason: null,
            execution: null,
            state: WORKFLOW_EXECUTION_STATES.FAILED,
          },
        });
        continue;
      }

      const outcome = entry.actionType === WORKFLOW_ACTION_TYPES.CLEANUP
        ? await simulateCleanupAction({
          cleanupEligibleMessageIds: workflowContext.cleanupEligibleMessageIds,
          leaseId: workflowContext.leaseId,
          requestedAt: entry.requestedAt,
          senderGroupId: entry.senderGroupId,
          sessionId: session.id,
        })
        : await simulateUnsubscribeAction({
          leaseId: workflowContext.leaseId,
          operations: workflowContext.unsubscribeOperations,
          requestedAt: entry.requestedAt,
          senderGroupId: entry.senderGroupId,
          sessionId: session.id,
        });

      if (!isCurrentSessionVersion(session.id, version)) {
        return;
      }

      setTerminalState({
        actionType: entry.actionType,
        requestedAt: entry.requestedAt,
        senderGroupId: entry.senderGroupId,
        sessionId: session.id,
        snapshot: outcome.snapshot,
      });
    }
  }

  async function executeSelections({ getWorkflowStatus, selections, session }) {
    if (activeJobsBySessionId.has(session.id)) {
      const error = new Error("Another simulated workflow execution is already running.");
      error.code = "workflow_execution_in_progress";
      throw error;
    }

    const requestedAt = now();
    const selectionQueue = [];

    for (const selection of selections) {
      if (selection.actions.unsubscribe) {
        selectionQueue.push({
          actionType: WORKFLOW_ACTION_TYPES.UNSUBSCRIBE,
          requestedAt,
          senderGroupId: selection.senderGroupId,
        });
      }

      if (selection.actions.cleanup) {
        selectionQueue.push({
          actionType: WORKFLOW_ACTION_TYPES.CLEANUP,
          requestedAt,
          senderGroupId: selection.senderGroupId,
        });
      }
    }

    const queueSize = selectionQueue.length;

    selectionQueue.forEach((entry, index) => {
      setRunningState({
        actionType: entry.actionType,
        phase: WORKFLOW_EXECUTION_PROGRESS_PHASES.QUEUED,
        queuePosition: index + 1,
        queueSize,
        requestedAt,
        senderGroupId: entry.senderGroupId,
        sessionId: session.id,
      });
    });

    const version = getSessionVersion(session.id);
    const jobPromise = (async () => {
      await delay(SIMULATED_QUEUE_DELAY_MS);
      await runSelectionQueue({
        selectionQueue: selectionQueue.map((entry, index) => ({
          ...entry,
          queuePosition: index + 1,
          queueSize,
        })),
        session,
        version,
      });
    })();

    activeJobsBySessionId.set(session.id, jobPromise);

    jobPromise.finally(() => {
      if (activeJobsBySessionId.get(session.id) === jobPromise) {
        activeJobsBySessionId.delete(session.id);
      }
    });

    return {
      actionResults: selections.map((selection) => ({
        senderGroupId: selection.senderGroupId,
      })),
      workflow: getWorkflowStatus({ session }),
    };
  }

  return {
    executeSelections,
    isSenderGroupUnsubscribeHandled,
    resetSession,
  };
}

let cachedService;

export function getWorkflowSimulationService() {
  if (cachedService) {
    return cachedService;
  }

  cachedService = createWorkflowSimulationService();
  return cachedService;
}