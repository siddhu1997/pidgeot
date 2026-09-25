import {
  CLEANUP_EXECUTION_GROUP_STATUSES,
  CLEANUP_EXECUTION_RESULT_STATUSES,
} from "@/lib/cleanup/constants";
import { getServerAppConfig } from "@/lib/config";
import { GmailErrorCategory } from "@/lib/gmail/error-map";
import { createGmailClient } from "@/lib/gmail/client";
import { processWithConcurrency } from "@/lib/scanning/concurrency";
import { SCAN_STATES } from "@/lib/scanning/constants";
import { getScanStore } from "@/lib/scanning/scan-store";
import { getProcessingLeaseStore } from "@/lib/sessions/processing-lease-store";
import { getCleanupExecutionStore } from "@/lib/cleanup/execution-store";

function buildMessageResult(messageId, status, extras = {}) {
  return {
    completedAt: Date.now(),
    messageId,
    status,
    ...extras,
  };
}

function deriveBlockedExecutionStatus({ lease, scan }) {
  if (scan?.state === SCAN_STATES.PAUSED || lease?.state === "PAUSED") {
    return CLEANUP_EXECUTION_RESULT_STATUSES.PAUSED;
  }

  return CLEANUP_EXECUTION_RESULT_STATUSES.LEASE_EXPIRED;
}

function summarizeCleanupExecution({ attemptedResults, totalEligibleCount }) {
  const successfulCount = attemptedResults.filter((result) => result.status === CLEANUP_EXECUTION_RESULT_STATUSES.SUCCESS).length;
  const alreadyCompletedCount = attemptedResults.filter((result) => result.status === CLEANUP_EXECUTION_RESULT_STATUSES.ALREADY_COMPLETED).length;
  const noLongerActionableCount = attemptedResults.filter((result) => result.status === CLEANUP_EXECUTION_RESULT_STATUSES.NO_LONGER_ACTIONABLE).length;
  const pausedCount = attemptedResults.filter((result) => result.status === CLEANUP_EXECUTION_RESULT_STATUSES.PAUSED).length;
  const leaseExpiredCount = attemptedResults.filter((result) => result.status === CLEANUP_EXECUTION_RESULT_STATUSES.LEASE_EXPIRED).length;
  const retryableFailureCount = attemptedResults.filter((result) => result.status === CLEANUP_EXECUTION_RESULT_STATUSES.FAILED_RETRYABLE).length;
  const permanentFailureCount = attemptedResults.filter((result) => result.status === CLEANUP_EXECUTION_RESULT_STATUSES.FAILED_PERMANENT).length;
  const reauthRequiredCount = attemptedResults.filter((result) => result.status === CLEANUP_EXECUTION_RESULT_STATUSES.REAUTH_REQUIRED).length;
  const completedCount = successfulCount + alreadyCompletedCount + noLongerActionableCount;
  const failedCount = retryableFailureCount + permanentFailureCount + reauthRequiredCount + pausedCount + leaseExpiredCount;
  const remainingEligibleCount = Math.max(
    0,
    totalEligibleCount - successfulCount - alreadyCompletedCount - noLongerActionableCount,
  );

  let status = CLEANUP_EXECUTION_GROUP_STATUSES.NONE_SUCCEEDED;

  if (remainingEligibleCount === 0 && totalEligibleCount > 0) {
    status = CLEANUP_EXECUTION_GROUP_STATUSES.ALL_SUCCEEDED;
  } else if (successfulCount > 0 || noLongerActionableCount > 0) {
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
      noLongerActionableCount,
      remainingEligibleCount,
      retryableFailureCount,
      successfulCount,
      totalEligibleCount,
    },
  };
}

function isStaleMailboxMutationError(error) {
  return error?.category === GmailErrorCategory.MALFORMED_REQUEST && error?.status === 404;
}

function mapCleanupErrorToStatus(error) {
  if (
    error?.category === GmailErrorCategory.AUTHENTICATION_REQUIRED ||
    error?.category === GmailErrorCategory.INVALID_REVOKED_CREDENTIAL
  ) {
    return CLEANUP_EXECUTION_RESULT_STATUSES.REAUTH_REQUIRED;
  }

  if (
    error?.category === GmailErrorCategory.RATE_LIMITED ||
    error?.category === GmailErrorCategory.TRANSIENT_API_FAILURE
  ) {
    return CLEANUP_EXECUTION_RESULT_STATUSES.FAILED_RETRYABLE;
  }

  // The scan snapshot is authoritative for cleanup eligibility; Gmail may have changed since discovery.
  if (isStaleMailboxMutationError(error)) {
    return CLEANUP_EXECUTION_RESULT_STATUSES.NO_LONGER_ACTIONABLE;
  }

  return CLEANUP_EXECUTION_RESULT_STATUSES.FAILED_PERMANENT;
}

export function createCleanupExecutionService({
  config = getServerAppConfig(),
  executionStore = getCleanupExecutionStore(),
  gmailClient = createGmailClient({ config }),
  processingLeaseStore = getProcessingLeaseStore(config),
  scanStore = getScanStore(config),
} = {}) {
  function getExecutionContext(sessionId, senderGroupId) {
    const cleanupContext = scanStore.getSenderGroupCleanupContextForSession(sessionId, senderGroupId);

    if (!cleanupContext) {
      const error = new Error("cleanup_sender_group_not_found");
      error.code = "cleanup_sender_group_not_found";
      throw error;
    }

    const lease = processingLeaseStore.getLease({
      leaseId: cleanupContext.leaseId,
      sessionId,
    });
    const scan = scanStore.getScanForSession(sessionId);

    return {
      cleanupContext,
      lease,
      scan,
    };
  }

  function canStartNewMutation(leaseId, sessionId) {
    return processingLeaseStore.canProcess({ leaseId, sessionId });
  }

  async function executeSenderGroupCleanup({ senderGroupId, session }) {
    const { cleanupContext, lease, scan } = getExecutionContext(session.id, senderGroupId);
    const attemptedResults = [];

    if (!canStartNewMutation(cleanupContext.leaseId, session.id)) {
      const blockedStatus = deriveBlockedExecutionStatus({ lease, scan });

      for (const messageId of cleanupContext.eligibleMessageIds) {
        attemptedResults.push(buildMessageResult(messageId, blockedStatus));
      }

      return {
        senderGroupId,
        ...summarizeCleanupExecution({
          attemptedResults,
          totalEligibleCount: cleanupContext.eligibleMessageIds.length,
        }),
      };
    }

    // The scan snapshot is authoritative for cleanup eligibility; Gmail may have changed since discovery.
    let stopSchedulingStatus = null;
    const succeededMessageIds = [];
    const reconciledMessageIds = [];

    const { remainingItems } = await processWithConcurrency(
      cleanupContext.eligibleMessageIds,
      async (messageId) => {
        if (!canStartNewMutation(cleanupContext.leaseId, session.id)) {
          const refreshedLease = processingLeaseStore.getLease({
            leaseId: cleanupContext.leaseId,
            sessionId: session.id,
          });
          const refreshedScan = scanStore.getScanForSession(session.id);
          stopSchedulingStatus = deriveBlockedExecutionStatus({
            lease: refreshedLease,
            scan: refreshedScan,
          });
          const blockedResult = buildMessageResult(messageId, stopSchedulingStatus);
          attemptedResults.push(blockedResult);
          return blockedResult;
        }

        const result = await executionStore.runMessageMutation({
          messageId,
          runner: async () => {
            try {
              await gmailClient.trashMessage({
                leaseId: cleanupContext.leaseId,
                messageId,
                sessionId: session.id,
              });
              return buildMessageResult(messageId, CLEANUP_EXECUTION_RESULT_STATUSES.SUCCESS);
            } catch (error) {
              return buildMessageResult(messageId, mapCleanupErrorToStatus(error));
            }
          },
          sessionId: session.id,
        });

        attemptedResults.push(result);

        if (result.status === CLEANUP_EXECUTION_RESULT_STATUSES.SUCCESS) {
          succeededMessageIds.push(messageId);
        }

        if (result.status === CLEANUP_EXECUTION_RESULT_STATUSES.NO_LONGER_ACTIONABLE) {
          reconciledMessageIds.push(messageId);
        }

        return result;
      },
      {
        concurrency: config.cleanupMutationConcurrency,
        shouldContinue: () => !stopSchedulingStatus,
      },
    );

    if (succeededMessageIds.length > 0 || reconciledMessageIds.length > 0) {
      scanStore.applyCleanupTrashMutationsForSession(session.id, [
        ...succeededMessageIds,
        ...reconciledMessageIds,
      ]);
    }

    if (remainingItems.length > 0 || stopSchedulingStatus) {
      const blockedStatus = stopSchedulingStatus || deriveBlockedExecutionStatus({
        lease: processingLeaseStore.getLease({
          leaseId: cleanupContext.leaseId,
          sessionId: session.id,
        }),
        scan: scanStore.getScanForSession(session.id),
      });

      for (const messageId of remainingItems) {
        attemptedResults.push(buildMessageResult(messageId, blockedStatus));
      }
    }

    return {
      senderGroupId,
      ...summarizeCleanupExecution({
        attemptedResults,
        totalEligibleCount: cleanupContext.eligibleMessageIds.length,
      }),
    };
  }

  return {
    executeSenderGroupCleanup,
  };
}