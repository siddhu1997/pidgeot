import { createCleanupExecutionService } from "@/lib/cleanup/execution-service";
import { CLEANUP_EXECUTION_RESULT_STATUSES } from "@/lib/cleanup/constants";
import { getServerAppConfig } from "@/lib/config";
import { getCleanupExecutionStore } from "@/lib/cleanup/execution-store";
import { createScanService } from "@/lib/scanning/scanner";
import { getScanStore } from "@/lib/scanning/scan-store";
import { getProcessingLeaseStore } from "@/lib/sessions/processing-lease-store";
import { createUnsubscribeExecutionService } from "@/lib/unsubscribe/execution-service";
import {
  UNSUBSCRIBE_EXECUTION_RESULT_STATUSES,
} from "@/lib/unsubscribe/constants";
import { getUnsubscribeExecutionStore } from "@/lib/unsubscribe/execution-store";
import {
  WORKFLOW_ACTION_TYPES,
  WORKFLOW_BLOCKING_REASONS,
  WORKFLOW_EXECUTION_STATES,
} from "@/lib/workflow/constants";
import { getWorkflowStore } from "@/lib/workflow/store";

function countByStatus(results, status) {
  return results.filter((result) => result.status === status).length;
}

function sanitizeCleanupExecution(cleanupExecution) {
  if (!cleanupExecution) {
    return null;
  }

  return {
    senderGroupId: cleanupExecution.senderGroupId,
    status: cleanupExecution.status,
    summary: cleanupExecution.summary,
  };
}

function sanitizeUnsubscribeExecution(unsubscribeExecution) {
  if (!unsubscribeExecution) {
    return null;
  }

  return {
    operationResults: Array.isArray(unsubscribeExecution.operationResults)
      ? unsubscribeExecution.operationResults.map((result) => ({
        completedAt: result.completedAt,
        operationId: result.operationId,
        operationType: result.operationType,
        retryAfterMs: result.retryAfterMs,
        status: result.status,
      }))
      : [],
    senderGroupId: unsubscribeExecution.senderGroupId,
    status: unsubscribeExecution.status,
    summary: unsubscribeExecution.summary,
  };
}

function deriveCleanupSnapshotFromExecution(cleanupExecution) {
  const sanitizedExecution = sanitizeCleanupExecution(cleanupExecution);
  const summary = sanitizedExecution?.summary || null;
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
    execution: sanitizedExecution,
    state,
  };
}

function deriveCleanupSnapshotFromResults({ eligibleMessageIds, messageIds, sessionId, executionStore }) {
  const knownResults = messageIds
    .map((messageId) => executionStore.getResult({ messageId, sessionId }))
    .filter(Boolean);

  if (knownResults.length === 0) {
    return {
      blockingReason: null,
      execution: null,
      state: WORKFLOW_EXECUTION_STATES.NOT_STARTED,
    };
  }

  const successfulCount = countByStatus(knownResults, CLEANUP_EXECUTION_RESULT_STATUSES.SUCCESS);
  const alreadyCompletedCount = countByStatus(knownResults, CLEANUP_EXECUTION_RESULT_STATUSES.ALREADY_COMPLETED);
  const reauthRequiredCount = countByStatus(knownResults, CLEANUP_EXECUTION_RESULT_STATUSES.REAUTH_REQUIRED);
  const retryableFailureCount = countByStatus(knownResults, CLEANUP_EXECUTION_RESULT_STATUSES.FAILED_RETRYABLE);
  const permanentFailureCount = countByStatus(knownResults, CLEANUP_EXECUTION_RESULT_STATUSES.FAILED_PERMANENT);
  const completedCount = successfulCount + alreadyCompletedCount;
  const failedCount = reauthRequiredCount + retryableFailureCount + permanentFailureCount;
  const remainingEligibleCount = Array.isArray(eligibleMessageIds) ? eligibleMessageIds.length : 0;
  const execution = {
    status: remainingEligibleCount === 0 && failedCount === 0
      ? "ALL_SUCCEEDED"
      : successfulCount > 0
        ? "PARTIAL_SUCCESS"
        : "NONE_SUCCEEDED",
    summary: {
      alreadyCompletedCount,
      completedCount,
      failedCount,
      leaseExpiredCount: 0,
      permanentFailureCount,
      pausedCount: 0,
      reauthRequiredCount,
      remainingEligibleCount,
      retryableFailureCount,
      successfulCount,
      totalEligibleCount: completedCount + failedCount + remainingEligibleCount,
    },
  };
  const state = successfulCount > 0 && remainingEligibleCount === 0 && failedCount === 0
    ? WORKFLOW_EXECUTION_STATES.COMPLETED
    : successfulCount > 0
      ? WORKFLOW_EXECUTION_STATES.PARTIAL_SUCCESS
      : reauthRequiredCount > 0
        ? WORKFLOW_EXECUTION_STATES.REAUTH_REQUIRED
        : WORKFLOW_EXECUTION_STATES.FAILED;

  return {
    blockingReason: null,
    execution,
    state,
  };
}

function shouldPreferDerivedCleanupState({ derivedState, storedState }) {
  if (!storedState) {
    return true;
  }

  if (storedState.state === WORKFLOW_EXECUTION_STATES.RUNNING) {
    return false;
  }

  if (storedState.state === WORKFLOW_EXECUTION_STATES.COMPLETED && derivedState.state !== WORKFLOW_EXECUTION_STATES.COMPLETED) {
    return true;
  }

  return false;
}

function deriveUnsubscribeSnapshotFromExecution(unsubscribeExecution) {
  const sanitizedExecution = sanitizeUnsubscribeExecution(unsubscribeExecution);
  const operationResults = sanitizedExecution?.operationResults || [];
  const successfulCount = countByStatus(operationResults, UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.SUCCESS)
    + countByStatus(operationResults, UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.ALREADY_COMPLETED);
  const manualCount = countByStatus(operationResults, UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.MANUAL_ACTION_REQUIRED);
  const pausedCount = countByStatus(operationResults, UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.PAUSED);
  const leaseExpiredCount = countByStatus(operationResults, UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.LEASE_EXPIRED);
  const usageLimitCount = countByStatus(operationResults, UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.USAGE_LIMIT_REACHED);
  const failedCount = countByStatus(operationResults, UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.FAILED_PERMANENT)
    + countByStatus(operationResults, UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.FAILED_RETRYABLE)
    + countByStatus(operationResults, UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.UNSAFE_TARGET)
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
    execution: sanitizedExecution,
    state,
  };
}

function deriveUnsubscribeSnapshotFromResults({ operations, sessionId, executionStore }) {
  const operationResults = operations
    .map((operation) => {
      const result = executionStore.getResult({ operationId: operation.id, sessionId });

      if (!result) {
        return null;
      }

      return {
        completedAt: result.completedAt,
        operationId: operation.id,
        operationType: operation.type,
        retryAfterMs: result.retryAfterMs,
        status: result.status,
      };
    })
    .filter(Boolean);

  if (operationResults.length === 0) {
    return {
      blockingReason: null,
      execution: null,
      state: WORKFLOW_EXECUTION_STATES.NOT_STARTED,
    };
  }

  return deriveUnsubscribeSnapshotFromExecution({
    operationResults,
    senderGroupId: null,
    status: null,
    summary: {
      alreadyCompletedCount: countByStatus(operationResults, UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.ALREADY_COMPLETED),
      manualCount: countByStatus(operationResults, UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.MANUAL_ACTION_REQUIRED),
      successfulCount: countByStatus(operationResults, UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.SUCCESS),
      totalOperationCount: operationResults.length,
    },
  });
}

function buildSelectionList(selections) {
  return [...selections].sort((left, right) => left.senderGroupId.localeCompare(right.senderGroupId));
}

export function createWorkflowService({
  cleanupExecutionService = createCleanupExecutionService(),
  cleanupExecutionStore = getCleanupExecutionStore(),
  config = getServerAppConfig(),
  processingLeaseStore = getProcessingLeaseStore(config),
  scanService = createScanService(),
  scanStore = getScanStore(config),
  unsubscribeExecutionService = createUnsubscribeExecutionService(),
  unsubscribeExecutionStore = getUnsubscribeExecutionStore(),
  workflowStore = getWorkflowStore(),
} = {}) {
  function getProcessingState(session) {
    const scan = scanStore.getScanForSession(session.id);

    if (!scan) {
      return {
        canProcess: false,
        leaseState: null,
        pauseReason: null,
        scanState: null,
      };
    }

    const lease = processingLeaseStore.getLease({
      leaseId: scan.leaseId,
      sessionId: session.id,
    });

    return {
      canProcess: Boolean(lease) && processingLeaseStore.canProcess({
        leaseId: scan.leaseId,
        sessionId: session.id,
      }),
      leaseState: lease?.state || null,
      pauseReason: scan.pauseReason,
      scanState: scan.state,
    };
  }

  function buildGroupWorkflowStatus({ group, sessionId }) {
    const workflowContext = scanStore.getSenderGroupWorkflowContextForSession(sessionId, group.id);
    const cleanupStoredState = workflowStore.getActionState({
      actionType: WORKFLOW_ACTION_TYPES.CLEANUP,
      senderGroupId: group.id,
      sessionId,
    });
    const unsubscribeStoredState = workflowStore.getActionState({
      actionType: WORKFLOW_ACTION_TYPES.UNSUBSCRIBE,
      senderGroupId: group.id,
      sessionId,
    });
    const cleanupDerivedState = workflowContext
      ? deriveCleanupSnapshotFromResults({
        eligibleMessageIds: workflowContext.cleanupEligibleMessageIds,
        executionStore: cleanupExecutionStore,
        messageIds: workflowContext.allMessageIds,
        sessionId,
      })
      : { blockingReason: null, execution: null, state: WORKFLOW_EXECUTION_STATES.NOT_STARTED };
    const unsubscribeDerivedState = workflowContext
      ? deriveUnsubscribeSnapshotFromResults({
        executionStore: unsubscribeExecutionStore,
        operations: workflowContext.unsubscribeOperations,
        sessionId,
      })
      : { blockingReason: null, execution: null, state: WORKFLOW_EXECUTION_STATES.NOT_STARTED };
    const cleanupState = shouldPreferDerivedCleanupState({
      derivedState: cleanupDerivedState,
      storedState: cleanupStoredState,
    })
      ? cleanupDerivedState
      : cleanupStoredState;
    const unsubscribeState = unsubscribeStoredState?.state === WORKFLOW_EXECUTION_STATES.RUNNING
      ? unsubscribeStoredState
      : unsubscribeStoredState || unsubscribeDerivedState;

    return {
      ...group,
      workflow: {
        classificationAvailable: true,
        cleanupEligibleCount: workflowContext?.cleanupEligibleMessageIds.length || 0,
        cleanupExecution: {
          blockingReason: cleanupState.blockingReason || null,
          execution: cleanupState.execution,
          state: cleanupState.state,
        },
        discovered: true,
        unsubscribeExecution: {
          blockingReason: unsubscribeState.blockingReason || null,
          execution: unsubscribeState.execution,
          state: unsubscribeState.state,
        },
        unsubscribeOperationsAvailable: Boolean(group.unsubscribe?.mechanisms?.length),
      },
    };
  }

  function getWorkflowStatus({ session }) {
    const scan = scanService.getScanStatus({ session });
    const senderGroups = Array.isArray(scan?.senderGroups)
      ? scan.senderGroups.map((group) => buildGroupWorkflowStatus({
        group,
        sessionId: session.id,
      }))
      : [];
    const automaticUnsubscribeUsage = typeof unsubscribeExecutionService.getAccountUsage === "function"
      ? unsubscribeExecutionService.getAccountUsage({ session })
      : null;

    return {
      processing: getProcessingState(session),
      scan: scan
        ? {
          ...scan,
          senderGroups,
        }
        : null,
      usage: automaticUnsubscribeUsage
        ? {
          automaticUnsubscribe: automaticUnsubscribeUsage,
        }
        : null,
    };
  }

  async function executeSelections({ selections, session }) {
    const normalizedSelections = buildSelectionList(selections);
    const actionResults = [];

    for (const selection of normalizedSelections) {
      const workflowContext = scanStore.getSenderGroupWorkflowContextForSession(session.id, selection.senderGroupId);

      if (!workflowContext) {
        const error = new Error("workflow_sender_group_not_found");
        error.code = "workflow_sender_group_not_found";
        throw error;
      }

      const senderGroupResult = {
        senderGroupId: selection.senderGroupId,
      };

      if (selection.actions.unsubscribe) {
        workflowStore.setActionState({
          actionType: WORKFLOW_ACTION_TYPES.UNSUBSCRIBE,
          senderGroupId: selection.senderGroupId,
          sessionId: session.id,
          state: {
            blockingReason: null,
            execution: null,
            requestedAt: Date.now(),
            state: WORKFLOW_EXECUTION_STATES.RUNNING,
          },
        });

        try {
          const unsubscribeExecution = await unsubscribeExecutionService.executeSenderGroup({
            senderGroupId: selection.senderGroupId,
            session,
          });
          const snapshot = deriveUnsubscribeSnapshotFromExecution(unsubscribeExecution);

          workflowStore.setActionState({
            actionType: WORKFLOW_ACTION_TYPES.UNSUBSCRIBE,
            senderGroupId: selection.senderGroupId,
            sessionId: session.id,
            state: {
              ...snapshot,
              requestedAt: Date.now(),
            },
          });
          senderGroupResult.unsubscribeExecution = snapshot.execution;
        } catch (error) {
          workflowStore.setActionState({
            actionType: WORKFLOW_ACTION_TYPES.UNSUBSCRIBE,
            senderGroupId: selection.senderGroupId,
            sessionId: session.id,
            state: {
              blockingReason: null,
              execution: null,
              requestedAt: Date.now(),
              state: WORKFLOW_EXECUTION_STATES.FAILED,
            },
          });
          throw error;
        }
      }

      if (selection.actions.cleanup) {
        workflowStore.setActionState({
          actionType: WORKFLOW_ACTION_TYPES.CLEANUP,
          senderGroupId: selection.senderGroupId,
          sessionId: session.id,
          state: {
            blockingReason: null,
            execution: null,
            requestedAt: Date.now(),
            state: WORKFLOW_EXECUTION_STATES.RUNNING,
          },
        });

        try {
          const cleanupExecution = await cleanupExecutionService.executeSenderGroupCleanup({
            senderGroupId: selection.senderGroupId,
            session,
          });
          const snapshot = deriveCleanupSnapshotFromExecution(cleanupExecution);

          workflowStore.setActionState({
            actionType: WORKFLOW_ACTION_TYPES.CLEANUP,
            senderGroupId: selection.senderGroupId,
            sessionId: session.id,
            state: {
              ...snapshot,
              requestedAt: Date.now(),
            },
          });
          senderGroupResult.cleanupExecution = snapshot.execution;
        } catch (error) {
          workflowStore.setActionState({
            actionType: WORKFLOW_ACTION_TYPES.CLEANUP,
            senderGroupId: selection.senderGroupId,
            sessionId: session.id,
            state: {
              blockingReason: null,
              execution: null,
              requestedAt: Date.now(),
              state: WORKFLOW_EXECUTION_STATES.FAILED,
            },
          });
          throw error;
        }
      }

      actionResults.push(senderGroupResult);
    }

    return {
      actionResults,
      workflow: getWorkflowStatus({ session }),
    };
  }

  return {
    executeSelections,
    getWorkflowStatus,
  };
}