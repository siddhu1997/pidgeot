import { getServerAppConfig } from "@/lib/config";
import { getSenderGroupById } from "@/lib/grouping/sender-grouper";
import { processWithConcurrency } from "@/lib/scanning/concurrency";
import { SCAN_STATES } from "@/lib/scanning/constants";
import { getScanStore } from "@/lib/scanning/scan-store";
import { getProcessingLeaseStore } from "@/lib/sessions/processing-lease-store";
import {
  UNSUBSCRIBE_EXECUTION_GROUP_STATUSES,
  UNSUBSCRIBE_EXECUTION_RESULT_STATUSES,
  UNSUBSCRIBE_OPERATION_STATUSES,
  UNSUBSCRIBE_OPERATION_TYPES,
} from "@/lib/unsubscribe/constants";
import { isAutomaticUnsubscribeFailureStatus } from "@/lib/unsubscribe/diagnostics";
import { getUnsubscribeExecutionStore } from "@/lib/unsubscribe/execution-store";
import {
  AUTOMATIC_UNSUBSCRIBE_RESERVATION_STATUSES,
  getUnsubscribeUsageStore,
} from "@/lib/unsubscribe/usage-store";
import { createUnsubscribeRetryPolicy } from "@/lib/unsubscribe/retry-policy";
import { createUnsubscribeTransport } from "@/lib/unsubscribe/transport";

function buildOperationResult(operation, status, extras = {}) {
  return {
    completedAt: Date.now(),
    operationId: operation.id,
    operationType: operation.type,
    status,
    ...extras,
  };
}

function deriveBlockedExecutionStatus({ lease, scan }) {
  if (scan?.state === SCAN_STATES.PAUSED || lease?.state === "PAUSED") {
    return UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.PAUSED;
  }

  return UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.LEASE_EXPIRED;
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

function summarizeGroupExecution(operationResults) {
  const successCount = operationResults.filter((result) => result.status === UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.SUCCESS).length;
  const alreadyCompletedCount = operationResults.filter((result) => result.status === UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.ALREADY_COMPLETED).length;
  const manualCount = operationResults.filter((result) => result.status === UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.MANUAL_ACTION_REQUIRED).length;
  const completedSuccessCount = successCount + alreadyCompletedCount;

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
      successfulCount: successCount,
      totalOperationCount: operationResults.length,
    },
  };
}

function getSenderLabel(scan, senderGroupId) {
  const group = getSenderGroupById(scan?.senderGrouping, senderGroupId);

  if (!group) {
    return null;
  }

  return group.displayNames?.[0] || group.representativeDomain || group.representativeAddress || null;
}

function recordAutomaticUnsubscribeDlq({ operation, result, scan, senderGroupId, sessionId }) {
  if (configIsProduction() || !isAutomaticUnsubscribeFailureStatus(result?.status)) {
    return;
  }

  const diagnostics = result.diagnostics || {};

  void import("@/lib/dev-lab/unsubscribe-dlq-store")
    .then(({ appendUnsubscribeDlqEntry }) => appendUnsubscribeDlqEntry({
      attemptNumber: diagnostics.attemptNumber,
      classification: result.status,
      durationMs: diagnostics.durationMs,
      failureCategory: diagnostics.failureCategory,
      httpStatus: result.httpStatus ?? diagnostics.httpStatus ?? null,
      mechanismType: operation.type,
      operationId: operation.id,
      redirect: diagnostics.redirect || result.redirect || null,
      request: diagnostics.request,
      response: diagnostics.response,
      scanId: scan?.id || null,
      senderGroupId,
      senderLabel: getSenderLabel(scan, senderGroupId),
      sessionId,
      target: diagnostics.target,
      timeout: diagnostics.timeout,
      transportCode: diagnostics.transportCode,
    }))
    .catch(() => {});
}

function configIsProduction() {
  try {
    return getServerAppConfig().isProduction === true;
  } catch {
    return true;
  }
}

export function createUnsubscribeExecutionService({
  config = getServerAppConfig(),
  executionStore = getUnsubscribeExecutionStore(),
  now = () => Date.now(),
  processingLeaseStore = getProcessingLeaseStore(config),
  retryPolicy = createUnsubscribeRetryPolicy({
    baseDelayMs: config.unsubscribeRetryBaseDelayMs,
    jitterMs: config.unsubscribeRetryJitterMs,
    maxAttempts: config.unsubscribeRetryMaxAttempts,
    maxDelayMs: config.unsubscribeRetryMaxDelayMs,
  }),
  scanStore = getScanStore(config),
  transport = createUnsubscribeTransport({
    maxRedirects: config.unsubscribeMaxRedirects,
    maxResponseBytes: config.unsubscribeMaxResponseBytes,
    requestTimeoutMs: config.unsubscribeRequestTimeoutMs,
    retryPolicy,
  }),
  usageStore = getUnsubscribeUsageStore(),
} = {}) {
  function getExecutionContext(sessionId, senderGroupId) {
    const unsubscribeContext = scanStore.getSenderGroupUnsubscribeContextForSession(sessionId, senderGroupId);

    if (!unsubscribeContext) {
      const error = new Error("unsubscribe_sender_group_not_found");
      error.code = "unsubscribe_sender_group_not_found";
      throw error;
    }

    const lease = processingLeaseStore.getLease({
      leaseId: unsubscribeContext.leaseId,
      sessionId,
    });
    const scan = scanStore.getScanForSession(sessionId);

    return {
      lease,
      scan,
      unsubscribeContext,
    };
  }

  function canStartNewOperation(leaseId, sessionId) {
    return processingLeaseStore.canProcess({ leaseId, sessionId });
  }

  function getUsage({ session } = {}) {
    return usageStore.getUsage({
      limit: config.automaticUnsubscribeLeaseLimit,
      sessionId: session?.id || null,
    });
  }

  async function executeSenderGroup({ senderGroupId, session }) {
    const { lease, scan, unsubscribeContext } = getExecutionContext(session.id, senderGroupId);
    const { executable, manual } = partitionOperations(unsubscribeContext.operations);
    const operationResults = manual.map((operation) => buildOperationResult(
      operation,
      UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.MANUAL_ACTION_REQUIRED,
    ));

    if (executable.length === 0) {
      return {
        senderGroupId,
        ...summarizeGroupExecution(operationResults),
      };
    }

    if (typeof processingLeaseStore.ensureActiveLeaseForUserAction === "function") {
      processingLeaseStore.ensureActiveLeaseForUserAction({
        leaseId: unsubscribeContext.leaseId,
        sessionId: session.id,
      });
    }

    if (!canStartNewOperation(unsubscribeContext.leaseId, session.id)) {
      const blockedStatus = deriveBlockedExecutionStatus({ lease, scan });

      return {
        senderGroupId,
        ...summarizeGroupExecution(
          [
            ...operationResults,
            ...executable.map((operation) => buildOperationResult(operation, blockedStatus)),
          ],
        ),
      };
    }

    let stopSchedulingStatus = null;

    const { remainingItems } = await processWithConcurrency(
      executable,
      async (operation) => {
        if (!canStartNewOperation(unsubscribeContext.leaseId, session.id)) {
          const refreshedLease = processingLeaseStore.getLease({
            leaseId: unsubscribeContext.leaseId,
            sessionId: session.id,
          });
          const refreshedScan = scanStore.getScanForSession(session.id);
          stopSchedulingStatus = deriveBlockedExecutionStatus({
            lease: refreshedLease,
            scan: refreshedScan,
          });
          const blockedResult = buildOperationResult(operation, stopSchedulingStatus);
          operationResults.push(blockedResult);
          return blockedResult;
        }

        processingLeaseStore.heartbeat({
          leaseId: unsubscribeContext.leaseId,
          sessionId: session.id,
        });

        const existingResult = executionStore.getResult({
          operationId: operation.id,
          sessionId: session.id,
        });

        if (existingResult?.status === UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.SUCCESS) {
          const alreadyCompletedResult = await executionStore.runOperation({
            host: operation.host,
            operationId: operation.id,
            runner: () => transport.executeOperation(operation),
            sessionId: session.id,
          });
          operationResults.push(alreadyCompletedResult);
          return alreadyCompletedResult;
        }

        const reservation = usageStore.reserveOperation({
          limit: config.automaticUnsubscribeLeaseLimit,
          operationId: operation.id,
          sessionId: session.id,
        });

        if (reservation.status === AUTOMATIC_UNSUBSCRIBE_RESERVATION_STATUSES.LIMIT_REACHED) {
          stopSchedulingStatus = UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.USAGE_LIMIT_REACHED;
          const blockedResult = buildOperationResult(
            operation,
            UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.USAGE_LIMIT_REACHED,
          );
          operationResults.push(blockedResult);
          return blockedResult;
        }

        let result;

        try {
          result = await executionStore.runOperation({
            host: operation.host,
            operationId: operation.id,
            runner: async () => {
              const nextResult = await transport.executeOperation(operation);
              recordAutomaticUnsubscribeDlq({
                operation,
                result: nextResult,
                scan,
                senderGroupId,
                sessionId: session.id,
              });
              return nextResult;
            },
            sessionId: session.id,
          });
        } finally {
          if (reservation.status === AUTOMATIC_UNSUBSCRIBE_RESERVATION_STATUSES.RESERVED) {
            usageStore.finalizeOperation({
              limit: config.automaticUnsubscribeLeaseLimit,
              operationId: operation.id,
              sessionId: session.id,
              success: result?.status === UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.SUCCESS,
            });
          }
        }

        operationResults.push(result);
        return result;
      },
      {
        concurrency: config.unsubscribeExecutionConcurrency,
        shouldContinue: () => !stopSchedulingStatus,
      },
    );

    if (remainingItems.length > 0 || stopSchedulingStatus) {
      const blockedStatus = stopSchedulingStatus || deriveBlockedExecutionStatus({
        lease: processingLeaseStore.getLease({
          leaseId: unsubscribeContext.leaseId,
          sessionId: session.id,
        }),
        scan: scanStore.getScanForSession(session.id),
      });

      for (const operation of remainingItems) {
        operationResults.push(buildOperationResult(operation, blockedStatus));
      }
    }

    return {
      senderGroupId,
      ...summarizeGroupExecution(operationResults),
    };
  }

  return {
    executeSenderGroup,
    getAccountUsage: getUsage,
    getUsage,
  };
}