import { createRandomToken } from "@/lib/auth/crypto";
import { getProcessingLeaseStore } from "@/lib/sessions/processing-lease-store";
import {
  DEFAULT_SCAN_METADATA_HEADERS,
  SCAN_PAUSE_REASONS,
  SCAN_SOURCE_QUERIES,
  SCAN_SOURCES,
  SCAN_STATES,
  SOURCE_SCAN_ORDER,
} from "@/lib/scanning/constants";
import {
  assertValidScanStateTransition,
  deriveActiveScanState,
} from "@/lib/scanning/state-machine";
import {
  getSenderGroupById,
  resolveSenderGroupUnsubscribe,
  getSenderGroupingStateShape,
  ingestMessagesIntoSenderGroups,
  listSanitizedSenderGroups,
} from "@/lib/grouping/sender-grouper";

function createSourceCheckpoint(source, now) {
  return {
    completedAt: null,
    currentPageToken: null,
    duplicateMessagesSkipped: 0,
    messagesDiscovered: 0,
    messagesNormalized: 0,
    metadataFailures: 0,
    pagesProcessed: 0,
    pendingMessageIds: [],
    pendingNextPageToken: null,
    pendingStartedAt: null,
    query: SCAN_SOURCE_QUERIES[source],
    source,
    updatedAt: now,
  };
}

function sanitizeSourceCheckpoint(checkpoint) {
  return {
    completedAt: checkpoint.completedAt,
    duplicateMessagesSkipped: checkpoint.duplicateMessagesSkipped,
    hasPendingPage: checkpoint.pendingMessageIds.length > 0,
    messagesDiscovered: checkpoint.messagesDiscovered,
    messagesNormalized: checkpoint.messagesNormalized,
    metadataFailures: checkpoint.metadataFailures,
    pagesProcessed: checkpoint.pagesProcessed,
    pendingMessageCount: checkpoint.pendingMessageIds.length,
    query: checkpoint.query,
    source: checkpoint.source,
    updatedAt: checkpoint.updatedAt,
  };
}

function sanitizeFailure(failure) {
  if (!failure) {
    return null;
  }

  return {
    category: failure.category || "UNKNOWN",
    message: failure.message || "Unknown scan failure.",
  };
}

function sanitizeResourceLimit(resourceLimit) {
  if (!resourceLimit) {
    return null;
  }

  return {
    code: resourceLimit.code || "UNKNOWN",
    currentMessageCount: Number.isFinite(resourceLimit.currentMessageCount)
      ? resourceLimit.currentMessageCount
      : null,
    maxRetainedMessages: Number.isFinite(resourceLimit.maxRetainedMessages)
      ? resourceLimit.maxRetainedMessages
      : null,
    message: resourceLimit.message || "The scan reached a configured resource limit.",
    pendingMessageCount: Number.isFinite(resourceLimit.pendingMessageCount)
      ? resourceLimit.pendingMessageCount
      : 0,
  };
}

function createScan({ accountKey, leaseId, metadataConcurrency, metadataHeaders, now, pageSize, sessionId }) {
  return {
    accountKey,
    counters: {
      activeMessagesDiscovered: 0,
      duplicateMessageIds: 0,
      messagesDiscovered: 0,
      messagesNormalized: 0,
      metadataFailures: 0,
      pagesProcessed: 0,
      trashMessagesDiscovered: 0,
    },
    createdAt: now,
    failure: null,
    id: createRandomToken(),
    lastProcessedSource: null,
    leaseId,
    metadataConcurrency,
    metadataHeaders,
    normalizedMessageOrder: [],
    normalizedMessagesById: new Map(),
    pageSize,
    pauseReason: null,
    resourceLimit: null,
    seenMessageIds: new Set(),
    senderGrouping: getSenderGroupingStateShape(),
    sessionId,
    sources: {
      [SCAN_SOURCES.ACTIVE_MAIL]: createSourceCheckpoint(SCAN_SOURCES.ACTIVE_MAIL, now),
      [SCAN_SOURCES.TRASH]: createSourceCheckpoint(SCAN_SOURCES.TRASH, now),
    },
    state: SCAN_STATES.DISCOVERING,
    updatedAt: now,
  };
}

export function createScanStore({ now = () => Date.now(), onScanDestroyed = () => {} } = {}) {
  const scanMap = new Map();
  const scanIdBySessionId = new Map();

  function destroyScan(scanId) {
    const scan = scanMap.get(scanId);

    if (!scan) {
      return;
    }

    scanMap.delete(scanId);
    scanIdBySessionId.delete(scan.sessionId);
    onScanDestroyed(scan);
  }

  function destroyScanForSession(sessionId) {
    const scanId = scanIdBySessionId.get(sessionId);

    if (!scanId) {
      return;
    }

    destroyScan(scanId);
  }

  function createSessionScan({ accountKey, leaseId, metadataConcurrency, metadataHeaders = DEFAULT_SCAN_METADATA_HEADERS, pageSize, sessionId }) {
    destroyScanForSession(sessionId);

    const nextScan = createScan({
      accountKey,
      leaseId,
      metadataConcurrency,
      metadataHeaders,
      now: now(),
      pageSize,
      sessionId,
    });

    scanMap.set(nextScan.id, nextScan);
    scanIdBySessionId.set(sessionId, nextScan.id);
    return nextScan;
  }

  function getScan(scanId) {
    return scanMap.get(scanId) || null;
  }

  function getScanForSession(sessionId) {
    const scanId = scanIdBySessionId.get(sessionId);
    return scanId ? getScan(scanId) : null;
  }

  function updateScan(scanId, updater) {
    const currentScan = getScan(scanId);

    if (!currentScan) {
      return null;
    }

    const nextScan = updater(currentScan);
    scanMap.set(scanId, nextScan);
    return nextScan;
  }

  function transitionScanState(scanId, nextState, extras = {}) {
    return updateScan(scanId, (scan) => {
      assertValidScanStateTransition(scan.state, nextState);

      return {
        ...scan,
        ...extras,
        state: nextState,
        updatedAt: now(),
      };
    });
  }

  function setScanLease(scanId, leaseId) {
    return updateScan(scanId, (scan) => ({
      ...scan,
      leaseId,
      updatedAt: now(),
    }));
  }

  function beginSourcePage(scanId, { messageRefs, nextPageToken, source }) {
    return updateScan(scanId, (scan) => {
      const sourceCheckpoint = scan.sources[source];

      if (!sourceCheckpoint) {
        throw new Error(`unknown_scan_source:${source}`);
      }

      if (sourceCheckpoint.pendingMessageIds.length > 0) {
        throw new Error(`pending_scan_page_exists:${source}`);
      }

      const uniqueMessageIds = [];
      let duplicateMessageIds = 0;

      for (const messageRef of messageRefs) {
        if (scan.seenMessageIds.has(messageRef.id)) {
          duplicateMessageIds += 1;
          continue;
        }

        scan.seenMessageIds.add(messageRef.id);
        uniqueMessageIds.push(messageRef.id);
      }

      const discoveredKey = source === SCAN_SOURCES.ACTIVE_MAIL
        ? "activeMessagesDiscovered"
        : "trashMessagesDiscovered";

      return {
        ...scan,
        counters: {
          ...scan.counters,
          [discoveredKey]: scan.counters[discoveredKey] + uniqueMessageIds.length,
          duplicateMessageIds: scan.counters.duplicateMessageIds + duplicateMessageIds,
          messagesDiscovered: scan.counters.messagesDiscovered + uniqueMessageIds.length,
        },
        lastProcessedSource: source,
        sources: {
          ...scan.sources,
          [source]: {
            ...sourceCheckpoint,
            duplicateMessagesSkipped:
              sourceCheckpoint.duplicateMessagesSkipped + duplicateMessageIds,
            messagesDiscovered:
              sourceCheckpoint.messagesDiscovered + uniqueMessageIds.length,
            pendingMessageIds: uniqueMessageIds,
            pendingNextPageToken: nextPageToken || null,
            pendingStartedAt: now(),
            updatedAt: now(),
          },
        },
        updatedAt: now(),
      };
    });
  }

  function commitSourcePageProgress(scanId, {
    metadataFailures,
    normalizedMessages,
    remainingPendingMessageIds,
    source,
  }) {
    return updateScan(scanId, (scan) => {
      const sourceCheckpoint = scan.sources[source];
      const nextMessagesById = new Map(scan.normalizedMessagesById);
      const nextMessageOrder = [...scan.normalizedMessageOrder];

      for (const normalizedMessage of normalizedMessages) {
        if (nextMessagesById.has(normalizedMessage.id)) {
          continue;
        }

        nextMessagesById.set(normalizedMessage.id, normalizedMessage);
        nextMessageOrder.push(normalizedMessage.id);
      }

      const pageFullyCommitted = remainingPendingMessageIds.length === 0;
      const nextSourceCheckpoint = {
        ...sourceCheckpoint,
        currentPageToken: pageFullyCommitted
          ? sourceCheckpoint.pendingNextPageToken
          : sourceCheckpoint.currentPageToken,
        messagesNormalized: sourceCheckpoint.messagesNormalized + normalizedMessages.length,
        metadataFailures: sourceCheckpoint.metadataFailures + metadataFailures,
        pagesProcessed:
          sourceCheckpoint.pagesProcessed + (pageFullyCommitted ? 1 : 0),
        pendingMessageIds: remainingPendingMessageIds,
        pendingNextPageToken: pageFullyCommitted ? null : sourceCheckpoint.pendingNextPageToken,
        pendingStartedAt: pageFullyCommitted ? null : sourceCheckpoint.pendingStartedAt,
        updatedAt: now(),
      };

      if (pageFullyCommitted && !nextSourceCheckpoint.currentPageToken) {
        nextSourceCheckpoint.completedAt = now();
      }

      const nextSenderGrouping = ingestMessagesIntoSenderGroups(
        scan.senderGrouping,
        normalizedMessages,
      );

      return {
        ...scan,
        counters: {
          ...scan.counters,
          messagesNormalized: scan.counters.messagesNormalized + normalizedMessages.length,
          metadataFailures: scan.counters.metadataFailures + metadataFailures,
          pagesProcessed: scan.counters.pagesProcessed + (pageFullyCommitted ? 1 : 0),
        },
        normalizedMessageOrder: nextMessageOrder,
        normalizedMessagesById: nextMessagesById,
        senderGrouping: nextSenderGrouping,
        sources: {
          ...scan.sources,
          [source]: nextSourceCheckpoint,
        },
        updatedAt: now(),
      };
    });
  }

  function pauseScan(scanId, pauseReason) {
    return transitionScanState(scanId, SCAN_STATES.PAUSED, {
      failure: null,
      pauseReason,
    });
  }

  function setScanFailure(scanId, state, failure) {
    return transitionScanState(scanId, state, {
      failure: sanitizeFailure(failure),
      pauseReason: null,
    });
  }

  function setResourceLimitReached(scanId, resourceLimit) {
    return transitionScanState(scanId, SCAN_STATES.RESOURCE_LIMIT_REACHED, {
      failure: null,
      pauseReason: null,
      resourceLimit: sanitizeResourceLimit(resourceLimit),
    });
  }

  function setProgressState(scanId) {
    const scan = getScan(scanId);

    if (!scan) {
      return null;
    }

    const isComplete = SOURCE_SCAN_ORDER.every((source) => Boolean(scan.sources[source].completedAt));

    if (isComplete) {
      return transitionScanState(scanId, SCAN_STATES.COMPLETE, {
        failure: null,
        pauseReason: null,
      });
    }

    return transitionScanState(scanId, deriveActiveScanState(scan), {
      failure: null,
      pauseReason: null,
    });
  }

  function listNormalizedMessagesForSession(sessionId) {
    const scan = getScanForSession(sessionId);

    if (!scan) {
      return [];
    }

    return scan.normalizedMessageOrder.map((messageId) => scan.normalizedMessagesById.get(messageId));
  }

  function rebuildSenderGrouping(normalizedMessages) {
    return ingestMessagesIntoSenderGroups(
      getSenderGroupingStateShape(),
      normalizedMessages,
    );
  }

  function buildCleanupEligibleMessageIds(scan, group) {
    return [...group.messageIds]
      .map((messageId) => scan.normalizedMessagesById.get(messageId))
      .filter(Boolean)
      .filter((message) => message.source === SCAN_SOURCES.ACTIVE_MAIL)
      .filter((message) => Array.isArray(message.labelIds) && message.labelIds.includes("UNREAD"))
      .map((message) => message.id)
      .filter((messageId, index, ids) => ids.indexOf(messageId) === index)
      .sort();
  }

  function getSenderGroupWorkflowContextForSession(sessionId, senderGroupId) {
    const scan = getScanForSession(sessionId);

    if (!scan) {
      return null;
    }

    const group = getSenderGroupById(scan.senderGrouping, senderGroupId);

    if (!group) {
      return null;
    }

    const unsubscribe = resolveSenderGroupUnsubscribe(group);

    return {
      allMessageIds: [...group.messageIds].sort(),
      cleanupEligibleMessageIds: buildCleanupEligibleMessageIds(scan, group),
      leaseId: scan.leaseId,
      senderGroupId: group.groupId,
      sessionId: scan.sessionId,
      unsubscribeOperations: unsubscribe.operations,
      unsubscribeSummary: unsubscribe.summary,
    };
  }

  function sanitizeScan(scan) {
    if (!scan) {
      return null;
    }

    return {
      accountKey: scan.accountKey,
      counters: { ...scan.counters },
      createdAt: scan.createdAt,
      failure: scan.failure,
      metadataConcurrency: scan.metadataConcurrency,
      pageSize: scan.pageSize,
      pauseReason: scan.pauseReason,
      partialResultsAvailable: scan.counters.messagesNormalized > 0,
      resourceLimit: scan.resourceLimit,
      scanId: scan.id,
      senderGroups: listSanitizedSenderGroups(scan.senderGrouping),
      sourceSummaries: {
        [SCAN_SOURCES.ACTIVE_MAIL]: sanitizeSourceCheckpoint(scan.sources[SCAN_SOURCES.ACTIVE_MAIL]),
        [SCAN_SOURCES.TRASH]: sanitizeSourceCheckpoint(scan.sources[SCAN_SOURCES.TRASH]),
      },
      state: scan.state,
      updatedAt: scan.updatedAt,
    };
  }

  return {
    beginSourcePage,
    commitSourcePageProgress,
    createSessionScan,
    destroyScan,
    destroyScanForSession,
    getScan,
    getScanForSession,
    getSanitizedScanForSession(sessionId) {
      return sanitizeScan(getScanForSession(sessionId));
    },
    getSenderGroupUnsubscribeContextForSession(sessionId, senderGroupId) {
      const workflowContext = getSenderGroupWorkflowContextForSession(sessionId, senderGroupId);

      if (!workflowContext) {
        return null;
      }

      return {
        leaseId: workflowContext.leaseId,
        operations: workflowContext.unsubscribeOperations,
        senderGroupId: workflowContext.senderGroupId,
        sessionId: workflowContext.sessionId,
        summary: workflowContext.unsubscribeSummary,
      };
    },
    getSenderGroupCleanupContextForSession(sessionId, senderGroupId) {
      const workflowContext = getSenderGroupWorkflowContextForSession(sessionId, senderGroupId);

      if (!workflowContext) {
        return null;
      }

      return {
        eligibleMessageIds: workflowContext.cleanupEligibleMessageIds,
        leaseId: workflowContext.leaseId,
        senderGroupId: workflowContext.senderGroupId,
        sessionId: workflowContext.sessionId,
      };
    },
    getSenderGroupWorkflowContextForSession,
    applyCleanupTrashMutationsForSession(sessionId, succeededMessageIds) {
      const scan = getScanForSession(sessionId);

      if (!scan || !Array.isArray(succeededMessageIds) || succeededMessageIds.length === 0) {
        return sanitizeScan(getScanForSession(sessionId));
      }

      const succeededIdSet = new Set(succeededMessageIds);

      updateScan(scan.id, (currentScan) => {
        const nextMessagesById = new Map(currentScan.normalizedMessagesById);

        for (const messageId of succeededIdSet) {
          const message = nextMessagesById.get(messageId);

          if (!message) {
            continue;
          }

          const nextLabelIds = new Set(Array.isArray(message.labelIds) ? message.labelIds : []);
          nextLabelIds.delete("INBOX");
          nextLabelIds.add("TRASH");

          nextMessagesById.set(messageId, {
            ...message,
            labelIds: [...nextLabelIds],
            source: SCAN_SOURCES.TRASH,
          });
        }

        const normalizedMessages = currentScan.normalizedMessageOrder
          .map((messageId) => nextMessagesById.get(messageId))
          .filter(Boolean);

        return {
          ...currentScan,
          normalizedMessagesById: nextMessagesById,
          senderGrouping: rebuildSenderGrouping(normalizedMessages),
          updatedAt: now(),
        };
      });

      return sanitizeScan(getScanForSession(sessionId));
    },
    listNormalizedMessagesForSession,
    pauseScan,
    setResourceLimitReached,
    setProgressState,
    setScanFailure,
    setScanLease,
    transitionScanState,
    updateScan,
  };
}

let cachedStore;

export function getScanStore(config) {
  if (cachedStore) {
    return cachedStore;
  }

  cachedStore = createScanStore({
    onScanDestroyed: (scan) => {
      if (!scan.leaseId) {
        return;
      }

      getProcessingLeaseStore(config).releaseLease({
        leaseId: scan.leaseId,
        sessionId: scan.sessionId,
      });
    },
  });

  return cachedStore;
}