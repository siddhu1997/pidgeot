import { isGmailReady } from "@/lib/auth/gmail-session";
import { createGmailClient } from "@/lib/gmail/client";
import { GmailAppError, GmailErrorCategory, mapGmailError } from "@/lib/gmail/error-map";
import { getServerAppConfig } from "@/lib/config";
import { getProcessingLeaseStore } from "@/lib/sessions/processing-lease-store";
import { processWithConcurrency } from "@/lib/scanning/concurrency";
import {
  DEFAULT_SCAN_METADATA_HEADERS,
  SCAN_PAUSE_REASONS,
  SCAN_RESOURCE_LIMIT_CODES,
  SCAN_SOURCES,
  SCAN_STATES,
  SOURCE_SCAN_ORDER,
} from "@/lib/scanning/constants";
import { normalizeGmailMessageMetadata } from "@/lib/scanning/normalizer";
import { getScanStore } from "@/lib/scanning/scan-store";
import { deriveActiveScanState, isTerminalScanState } from "@/lib/scanning/state-machine";

function validateListResponse(page) {
  if (!page || (page.messages != null && !Array.isArray(page.messages))) {
    throw new GmailAppError({
      category: GmailErrorCategory.MALFORMED_REQUEST,
      message: "The Gmail list response was malformed.",
    });
  }

  return {
    messages: Array.isArray(page.messages) ? page.messages.filter((message) => typeof message?.id === "string") : [],
    nextPageToken: typeof page.nextPageToken === "string" ? page.nextPageToken : null,
  };
}

function selectNextSource(scan) {
  for (const source of SOURCE_SCAN_ORDER) {
    if (scan.sources[source].pendingMessageIds.length > 0) {
      return source;
    }
  }

  const incompleteSources = SOURCE_SCAN_ORDER.filter((source) => !scan.sources[source].completedAt);

  if (incompleteSources.length === 0) {
    return null;
  }

  if (incompleteSources.length === 1) {
    return incompleteSources[0];
  }

  return scan.lastProcessedSource === SCAN_SOURCES.ACTIVE_MAIL
    ? SCAN_SOURCES.TRASH
    : SCAN_SOURCES.ACTIVE_MAIL;
}

function isLeaseActive(processingLeaseStore, scan) {
  return processingLeaseStore.canProcess({
    leaseId: scan.leaseId,
    sessionId: scan.sessionId,
  });
}

function isUserPaused(scanStore, scanId) {
  return scanStore.getScan(scanId)?.state === SCAN_STATES.PAUSED;
}

function getCurrentPauseReason(scanStore, scanId) {
  const scan = scanStore.getScan(scanId);

  if (scan?.state !== SCAN_STATES.PAUSED) {
    return null;
  }

  return scan.pauseReason || SCAN_PAUSE_REASONS.USER_REQUESTED;
}

function getDeferredMessageIds({ deferredEntries, remainingItems }) {
  const deferredIds = deferredEntries
    .sort((left, right) => left.index - right.index)
    .map((entry) => entry.messageId);

  return [...deferredIds, ...remainingItems.map((item) => item.messageId)];
}

function mapScanFailure(error) {
  const mappedError = mapGmailError(error);
  return {
    category: mappedError.category,
    message: mappedError.message,
  };
}

function getSessionMessageLimit(config) {
  if (!config.isProduction && Number.isFinite(config.devScanMessageLimit)) {
    return Math.min(config.devScanMessageLimit, config.scanMaxRetainedMessages);
  }

  return config.scanMaxRetainedMessages;
}

function isDevelopmentMessageLimitActive(config) {
  return !config.isProduction && Number.isFinite(config.devScanMessageLimit);
}

function getRemainingMessageAllowance(scan, config) {
  return Math.max(0, getSessionMessageLimit(config) - scan.counters.messagesNormalized);
}

function buildSessionMessageLimit(scan, config, pendingMessageCount = 0) {
  const maxRetainedMessages = getSessionMessageLimit(config);

  return {
    code: isDevelopmentMessageLimitActive(config)
      ? SCAN_RESOURCE_LIMIT_CODES.DEVELOPMENT_MESSAGE_LIMIT
      : SCAN_RESOURCE_LIMIT_CODES.MAX_RETAINED_MESSAGES,
    currentMessageCount: scan.counters.messagesNormalized,
    maxRetainedMessages,
    message: isDevelopmentMessageLimitActive(config)
      ? `Development scan limit reached. Showing the first ${maxRetainedMessages} messages for this local test run.`
      : `The scan reached the retained message limit of ${maxRetainedMessages}.`,
    pendingMessageCount,
  };
}

function hasReachedSessionMessageLimit(scan, config) {
  return scan.counters.messagesNormalized >= getSessionMessageLimit(config);
}

function shouldStopForResourceLimit(scan, config) {
  return Boolean(selectNextSource(scan)) && hasReachedSessionMessageLimit(scan, config);
}

function shouldPauseExpiredActiveScan({ processingLeaseStore, scan, scanStore }) {
  if (!scan) {
    return false;
  }

  if (isTerminalScanState(scan.state) || scan.state === SCAN_STATES.PAUSED || scan.state === SCAN_STATES.REAUTH_REQUIRED) {
    return false;
  }

  if (isLeaseActive(processingLeaseStore, scan)) {
    return false;
  }

  scanStore.pauseScan(scan.id, SCAN_PAUSE_REASONS.LEASE_EXPIRED);
  return true;
}

export function createScanService({
  config = getServerAppConfig(),
  gmailClient = createGmailClient({ config }),
  processingLeaseStore = getProcessingLeaseStore(config),
  scanStore = getScanStore(config),
} = {}) {
  async function processMetadataChunk(scan, source, maxMessageCount) {
    const sourceCheckpoint = scan.sources[source];
    const pendingMessageIds = sourceCheckpoint.pendingMessageIds;
    const allowedMessageCount = Math.max(0, Math.min(
      Number.isFinite(maxMessageCount) ? maxMessageCount : pendingMessageIds.length,
      pendingMessageIds.length,
    ));
    const pendingItems = pendingMessageIds.slice(0, allowedMessageCount).map((messageId, index) => ({
      index,
      messageId,
    }));
    const normalizedMessages = [];
    const deferredEntries = pendingMessageIds.slice(allowedMessageCount).map((messageId, index) => ({
      index: allowedMessageCount + index,
      messageId,
    }));
    let inFlightMessageCount = 0;
    let metadataFailures = 0;
    let fatalError = null;
    let pauseReason = null;

    function syncInFlightMessageCount() {
      scanStore.setSourceInFlightMessageCount(scan.id, {
        inFlightMessageCount,
        source,
      });
    }

    const { remainingItems } = await processWithConcurrency(
      pendingItems,
      async ({ index, messageId }) => {
        if (fatalError || pauseReason) {
          deferredEntries.push({ index, messageId });
          return null;
        }

        inFlightMessageCount += 1;
        syncInFlightMessageCount();

        try {
          const message = await gmailClient.getMessageMetadata({
            headers: scan.metadataHeaders,
            leaseId: scan.leaseId,
            messageId,
            sessionId: scan.sessionId,
          });
          normalizedMessages.push(normalizeGmailMessageMetadata({
            message,
            source,
          }));
          return null;
        } catch (error) {
          const mappedError = mapGmailError(error);
          const currentPauseReason = getCurrentPauseReason(scanStore, scan.id);

          if (currentPauseReason) {
            pauseReason = currentPauseReason;
            deferredEntries.push({ index, messageId });
            return null;
          }

          if (!isLeaseActive(processingLeaseStore, scan)) {
            pauseReason = SCAN_PAUSE_REASONS.LEASE_EXPIRED;
            deferredEntries.push({ index, messageId });
            return null;
          }

          if (
            mappedError.category === GmailErrorCategory.AUTHENTICATION_REQUIRED ||
            mappedError.category === GmailErrorCategory.INVALID_REVOKED_CREDENTIAL
          ) {
            fatalError = mappedError;
            deferredEntries.push({ index, messageId });
            return null;
          }

          metadataFailures += 1;
          return null;
        } finally {
          inFlightMessageCount = Math.max(0, inFlightMessageCount - 1);
          syncInFlightMessageCount();
        }
      },
      {
        concurrency: scan.metadataConcurrency,
        shouldContinue: () => {
          const currentPauseReason = getCurrentPauseReason(scanStore, scan.id);

          if (currentPauseReason) {
            pauseReason = currentPauseReason;
            return false;
          }

          if (fatalError || pauseReason) {
            return false;
          }

          if (!isLeaseActive(processingLeaseStore, scan)) {
            pauseReason = SCAN_PAUSE_REASONS.LEASE_EXPIRED;
            return false;
          }

          return true;
        },
      },
    );

    scanStore.commitSourcePageProgress(scan.id, {
      metadataFailures,
      normalizedMessages,
      remainingPendingMessageIds: getDeferredMessageIds({
        deferredEntries,
        remainingItems,
      }),
      source,
    });

    return {
      fatalError,
      pauseReason,
    };
  }

  async function processNextChunk({ session }) {
    const scan = scanStore.getScanForSession(session.id);

    if (!scan) {
      return null;
    }

    if (isTerminalScanState(scan.state)) {
      return scanStore.getSanitizedScanForSession(session.id);
    }

    if (scan.state === SCAN_STATES.PAUSED || scan.state === SCAN_STATES.REAUTH_REQUIRED) {
      return scanStore.getSanitizedScanForSession(session.id);
    }

    if (shouldPauseExpiredActiveScan({ processingLeaseStore, scan, scanStore })) {
      return scanStore.getSanitizedScanForSession(session.id);
    }

    const nextSource = selectNextSource(scan);

    if (!nextSource) {
      scanStore.setProgressState(scan.id);
      return scanStore.getSanitizedScanForSession(session.id);
    }

    if (hasReachedSessionMessageLimit(scan, config)) {
      scanStore.setResourceLimitReached(scan.id, buildSessionMessageLimit(scan, config));
      return scanStore.getSanitizedScanForSession(session.id);
    }

    try {
      const activeScan = scanStore.getScan(scan.id);

      if (!activeScan || activeScan.state === SCAN_STATES.PAUSED || activeScan.state === SCAN_STATES.REAUTH_REQUIRED) {
        return scanStore.getSanitizedScanForSession(session.id);
      }

      const sourceCheckpoint = activeScan.sources[nextSource];
      const remainingAllowance = getRemainingMessageAllowance(activeScan, config);

      if (remainingAllowance <= 0) {
        scanStore.setResourceLimitReached(scan.id, buildSessionMessageLimit(activeScan, config));
        return scanStore.getSanitizedScanForSession(session.id);
      }

      if (sourceCheckpoint.pendingMessageIds.length === 0) {
        const page = validateListResponse(await gmailClient.listMessagePage({
          leaseId: activeScan.leaseId,
          maxResults: Math.min(activeScan.pageSize, remainingAllowance),
          pageToken: sourceCheckpoint.currentPageToken || "",
          query: sourceCheckpoint.query,
          sessionId: activeScan.sessionId,
        }));

        const scanAfterListing = scanStore.getScan(scan.id);

        if (!scanAfterListing || scanAfterListing.state === SCAN_STATES.PAUSED || scanAfterListing.state === SCAN_STATES.REAUTH_REQUIRED) {
          return scanStore.getSanitizedScanForSession(session.id);
        }

        if (shouldPauseExpiredActiveScan({ processingLeaseStore, scan: scanAfterListing, scanStore })) {
          return scanStore.getSanitizedScanForSession(session.id);
        }

        scanStore.beginSourcePage(activeScan.id, {
          messageRefs: page.messages,
          nextPageToken: page.nextPageToken,
          source: nextSource,
        });
      }

      const scanWithPendingPage = scanStore.getScan(scan.id);
      const remainingPendingAllowance = getRemainingMessageAllowance(scanWithPendingPage, config);

      if (remainingPendingAllowance <= 0) {
        scanStore.setResourceLimitReached(
          scan.id,
          buildSessionMessageLimit(
            scanWithPendingPage,
            config,
            scanWithPendingPage.sources[nextSource].pendingMessageIds.length,
          ),
        );
        return scanStore.getSanitizedScanForSession(session.id);
      }

      const pageOutcome = await processMetadataChunk(
        scanWithPendingPage,
        nextSource,
        remainingPendingAllowance,
      );

      if (pageOutcome.fatalError) {
        scanStore.setScanFailure(scan.id, SCAN_STATES.REAUTH_REQUIRED, pageOutcome.fatalError);
        return scanStore.getSanitizedScanForSession(session.id);
      }

      if (pageOutcome.pauseReason) {
        scanStore.pauseScan(scan.id, pageOutcome.pauseReason);
        return scanStore.getSanitizedScanForSession(session.id);
      }

      if (!isLeaseActive(processingLeaseStore, scanStore.getScan(scan.id))) {
        scanStore.pauseScan(scan.id, SCAN_PAUSE_REASONS.LEASE_EXPIRED);
        return scanStore.getSanitizedScanForSession(session.id);
      }

      if (isUserPaused(scanStore, scan.id)) {
        return scanStore.getSanitizedScanForSession(session.id);
      }

      if (shouldStopForResourceLimit(scanStore.getScan(scan.id), config)) {
        scanStore.setResourceLimitReached(
          scan.id,
          buildSessionMessageLimit(scanStore.getScan(scan.id), config),
        );
        return scanStore.getSanitizedScanForSession(session.id);
      }

      scanStore.setProgressState(scan.id);
      return scanStore.getSanitizedScanForSession(session.id);
    } catch (error) {
      const mappedError = mapGmailError(error);

      if (!isLeaseActive(processingLeaseStore, scanStore.getScan(scan.id))) {
        scanStore.pauseScan(scan.id, SCAN_PAUSE_REASONS.LEASE_EXPIRED);
        return scanStore.getSanitizedScanForSession(session.id);
      }

      if (
        mappedError.category === GmailErrorCategory.AUTHENTICATION_REQUIRED ||
        mappedError.category === GmailErrorCategory.INVALID_REVOKED_CREDENTIAL
      ) {
        scanStore.setScanFailure(scan.id, SCAN_STATES.REAUTH_REQUIRED, mappedError);
        return scanStore.getSanitizedScanForSession(session.id);
      }

      scanStore.setScanFailure(scan.id, SCAN_STATES.FAILED, mapScanFailure(mappedError));
      return scanStore.getSanitizedScanForSession(session.id);
    }
  }

  function ensureGmailCapableSession(session) {
    if (!isGmailReady(session)) {
      throw new GmailAppError({
        category: GmailErrorCategory.AUTHENTICATION_REQUIRED,
        message: "Gmail access must be enabled before scanning can begin.",
      });
    }
  }

  function buildStartedScan(session, lease) {
    return scanStore.createSessionScan({
      accountKey: session.accountKey,
      leaseId: lease.id,
      metadataConcurrency: config.scanMetadataConcurrency,
      metadataHeaders: DEFAULT_SCAN_METADATA_HEADERS,
      pageSize: config.scanPageSize,
      sessionId: session.id,
    });
  }

  return {
    async pauseScan({ session }) {
      const scan = scanStore.getScanForSession(session.id);

      if (!scan) {
        return null;
      }

      processingLeaseStore.pauseLease({
        leaseId: scan.leaseId,
        sessionId: session.id,
      });
      scanStore.pauseScan(scan.id, SCAN_PAUSE_REASONS.USER_REQUESTED);
      return scanStore.getSanitizedScanForSession(session.id);
    },

    async resumeScan({ session }) {
      ensureGmailCapableSession(session);

      const scan = scanStore.getScanForSession(session.id);

      if (!scan) {
        return null;
      }

      if (scan.state === SCAN_STATES.RESOURCE_LIMIT_REACHED) {
        return scanStore.getSanitizedScanForSession(session.id);
      }

      const resumedLease = processingLeaseStore.resumeLease({
        leaseId: scan.leaseId,
        sessionId: session.id,
      }) || processingLeaseStore.acquireLease({ sessionId: session.id });
      const resumedState = deriveActiveScanState(scan);

      scanStore.setScanLease(scan.id, resumedLease.id);
      scanStore.transitionScanState(scan.id, resumedState, {
        failure: null,
        pauseReason: null,
      });

      return processNextChunk({ session });
    },

    async startScan({ session }) {
      ensureGmailCapableSession(session);
      const lease = processingLeaseStore.acquireLease({ sessionId: session.id });

      buildStartedScan(session, lease);
      return scanStore.getSanitizedScanForSession(session.id);
    },

    getNormalizedMessages({ sessionId }) {
      return scanStore.listNormalizedMessagesForSession(sessionId);
    },

    getScanStatus({ session }) {
      const scan = scanStore.getScanForSession(session.id);

      if (shouldPauseExpiredActiveScan({ processingLeaseStore, scan, scanStore })) {
        return scanStore.getSanitizedScanForSession(session.id);
      }

      return scanStore.getSanitizedScanForSession(session.id);
    },

    processNextChunk,
  };
}