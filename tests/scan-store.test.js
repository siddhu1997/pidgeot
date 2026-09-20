import { describe, expect, it } from "vitest";

import { SCAN_PAUSE_REASONS, SCAN_SOURCES, SCAN_STATES } from "@/lib/scanning/constants";
import { createScanStore } from "@/lib/scanning/scan-store";

describe("scan store", () => {
  it("tracks independent source checkpoints and sanitized scan state", () => {
    const scanStore = createScanStore({ now: () => 1000 });
    const scan = scanStore.createSessionScan({
      accountKey: "account-key",
      leaseId: "lease-1",
      metadataConcurrency: 5,
      pageSize: 50,
      sessionId: "session-1",
    });

    scanStore.beginSourcePage(scan.id, {
      messageRefs: [{ id: "a-1" }, { id: "a-2" }],
      nextPageToken: "active-page-2",
      source: SCAN_SOURCES.ACTIVE_MAIL,
    });
    scanStore.commitSourcePageProgress(scan.id, {
      metadataFailures: 0,
      normalizedMessages: [
        {
          headers: {
            from: "Alerts <alerts@example.com>",
            listId: null,
            listUnsubscribe: null,
            sender: null,
          },
          id: "a-1",
          labelIds: ["UNREAD"],
          source: SCAN_SOURCES.ACTIVE_MAIL,
        },
        {
          headers: {
            from: "Alerts <alerts@example.com>",
            listId: null,
            listUnsubscribe: null,
            sender: null,
          },
          id: "a-2",
          labelIds: [],
          source: SCAN_SOURCES.ACTIVE_MAIL,
        },
      ],
      remainingPendingMessageIds: [],
      source: SCAN_SOURCES.ACTIVE_MAIL,
    });
    scanStore.beginSourcePage(scan.id, {
      messageRefs: [{ id: "t-1" }],
      nextPageToken: null,
      source: SCAN_SOURCES.TRASH,
    });
    scanStore.commitSourcePageProgress(scan.id, {
      metadataFailures: 1,
      normalizedMessages: [],
      remainingPendingMessageIds: ["t-1"],
      source: SCAN_SOURCES.TRASH,
    });
    scanStore.pauseScan(scan.id, SCAN_PAUSE_REASONS.USER_REQUESTED);

    expect(scanStore.getSanitizedScanForSession("session-1")).toEqual(
      expect.objectContaining({
        counters: expect.objectContaining({
          activeMessagesDiscovered: 2,
          messagesNormalized: 2,
          metadataFailures: 1,
          pagesProcessed: 1,
          trashMessagesDiscovered: 1,
        }),
        partialResultsAvailable: true,
        pauseReason: SCAN_PAUSE_REASONS.USER_REQUESTED,
        senderGroups: [
          expect.objectContaining({
            activeCount: 2,
            attention: "LOW",
            addresses: [
              expect.objectContaining({
                canonicalAddress: "alerts@example.com",
              }),
            ],
            category: "UNKNOWN",
            classificationSignals: [
              expect.objectContaining({
                type: "INSUFFICIENT_CLASSIFICATION_EVIDENCE",
              }),
            ],
            messageCount: 2,
            unsubscribe: {
              mechanisms: [],
              resolutionStatus: "UNAVAILABLE",
            },
            unreadCount: 1,
          }),
        ],
        sourceSummaries: expect.objectContaining({
          ACTIVE_MAIL: expect.objectContaining({
            pagesProcessed: 1,
            pendingMessageCount: 0,
          }),
          TRASH: expect.objectContaining({
            hasPendingPage: true,
            pendingMessageCount: 1,
          }),
        }),
        state: SCAN_STATES.PAUSED,
      }),
    );
  });

  it("deduplicates message ids across sources and keeps normalized output internal", () => {
    const scanStore = createScanStore({ now: () => 2000 });
    const scan = scanStore.createSessionScan({
      accountKey: "account-key",
      leaseId: "lease-1",
      metadataConcurrency: 5,
      pageSize: 50,
      sessionId: "session-1",
    });

    scanStore.beginSourcePage(scan.id, {
      messageRefs: [{ id: "dup-1" }],
      nextPageToken: null,
      source: SCAN_SOURCES.ACTIVE_MAIL,
    });
    scanStore.commitSourcePageProgress(scan.id, {
      metadataFailures: 0,
      normalizedMessages: [{
        headers: {
          from: "One <one@example.com>",
          listId: null,
          listUnsubscribe: null,
          sender: null,
        },
        id: "dup-1",
        labelIds: [],
        source: SCAN_SOURCES.ACTIVE_MAIL,
      }],
      remainingPendingMessageIds: [],
      source: SCAN_SOURCES.ACTIVE_MAIL,
    });
    scanStore.beginSourcePage(scan.id, {
      messageRefs: [{ id: "dup-1" }],
      nextPageToken: null,
      source: SCAN_SOURCES.TRASH,
    });

    const storedScan = scanStore.getScanForSession("session-1");
    expect(storedScan.sources.TRASH.pendingMessageIds).toEqual([]);
    expect(storedScan.counters.duplicateMessageIds).toBe(1);
    expect(scanStore.listNormalizedMessagesForSession("session-1")).toEqual([
      {
        headers: {
          from: "One <one@example.com>",
          listId: null,
          listUnsubscribe: null,
          sender: null,
        },
        id: "dup-1",
        labelIds: [],
        source: SCAN_SOURCES.ACTIVE_MAIL,
      },
    ]);
    expect(scanStore.getSanitizedScanForSession("session-1")).not.toHaveProperty("normalizedMessagesById");
    expect(scanStore.getSanitizedScanForSession("session-1").senderGroups).toEqual([
      expect.objectContaining({
        attention: "LOW",
        category: "UNKNOWN",
        messageCount: 1,
        representativeAddress: "one@example.com",
        unsubscribe: {
          mechanisms: [],
          resolutionStatus: "UNAVAILABLE",
        },
      }),
    ]);
  });

  it("derives cleanup eligibility from unread active messages only and updates grouping after successful trash mutations", () => {
    const scanStore = createScanStore({ now: () => 3000 });
    const scan = scanStore.createSessionScan({
      accountKey: "account-key",
      leaseId: "lease-1",
      metadataConcurrency: 5,
      pageSize: 50,
      sessionId: "session-1",
    });

    scanStore.beginSourcePage(scan.id, {
      messageRefs: [{ id: "a-1" }, { id: "a-2" }, { id: "a-3" }, { id: "t-1" }],
      nextPageToken: null,
      source: SCAN_SOURCES.ACTIVE_MAIL,
    });
    scanStore.commitSourcePageProgress(scan.id, {
      metadataFailures: 0,
      normalizedMessages: [
        {
          headers: { from: "Alerts <alerts@example.com>", listId: null, listUnsubscribe: null, sender: null },
          id: "a-1",
          labelIds: ["UNREAD", "INBOX"],
          source: SCAN_SOURCES.ACTIVE_MAIL,
        },
        {
          headers: { from: "Alerts <alerts@example.com>", listId: null, listUnsubscribe: null, sender: null },
          id: "a-2",
          labelIds: ["INBOX"],
          source: SCAN_SOURCES.ACTIVE_MAIL,
        },
        {
          headers: { from: "Receipts <receipts@example.com>", listId: null, listUnsubscribe: null, sender: null },
          id: "a-3",
          labelIds: ["UNREAD", "INBOX"],
          source: SCAN_SOURCES.ACTIVE_MAIL,
        },
        {
          headers: { from: "Alerts <alerts@example.com>", listId: null, listUnsubscribe: null, sender: null },
          id: "t-1",
          labelIds: ["UNREAD", "TRASH"],
          source: SCAN_SOURCES.TRASH,
        },
      ],
      remainingPendingMessageIds: [],
      source: SCAN_SOURCES.ACTIVE_MAIL,
    });

    const alertsGroup = scanStore.getSanitizedScanForSession("session-1").senderGroups.find((group) => group.representativeAddress === "alerts@example.com");
    const receiptsGroup = scanStore.getSanitizedScanForSession("session-1").senderGroups.find((group) => group.representativeAddress === "receipts@example.com");

    expect(scanStore.getSenderGroupCleanupContextForSession("session-1", alertsGroup.id)).toEqual({
      eligibleMessageIds: ["a-1"],
      leaseId: "lease-1",
      senderGroupId: alertsGroup.id,
      sessionId: "session-1",
    });
    expect(scanStore.getSenderGroupCleanupContextForSession("session-1", receiptsGroup.id).eligibleMessageIds).toEqual(["a-3"]);

    scanStore.applyCleanupTrashMutationsForSession("session-1", ["a-1"]);

    const updatedAlertsGroup = scanStore.getSanitizedScanForSession("session-1").senderGroups.find((group) => group.representativeAddress === "alerts@example.com");
    const updatedMessage = scanStore.listNormalizedMessagesForSession("session-1").find((message) => message.id === "a-1");

    expect(scanStore.getSenderGroupCleanupContextForSession("session-1", alertsGroup.id).eligibleMessageIds).toEqual([]);
    expect(updatedAlertsGroup).toEqual(expect.objectContaining({
      activeCount: 1,
      messageCount: 3,
      sourceCounts: {
        ACTIVE_MAIL: 1,
        TRASH: 2,
      },
      trashCount: 2,
      unreadCount: 2,
    }));
    expect(updatedMessage).toEqual(
      expect.objectContaining({
        labelIds: expect.arrayContaining(["TRASH", "UNREAD"]),
        source: SCAN_SOURCES.TRASH,
      }),
    );
    expect(updatedMessage.labelIds).not.toContain("INBOX");

    scanStore.applyCleanupTrashMutationsForSession("session-1", ["a-1"]);

    expect(scanStore.getSenderGroupCleanupContextForSession("session-1", alertsGroup.id).eligibleMessageIds).toEqual([]);
    expect(scanStore.getSanitizedScanForSession("session-1").senderGroups.find((group) => group.representativeAddress === "alerts@example.com")).toEqual(
      expect.objectContaining({
        activeCount: 1,
        messageCount: 3,
        sourceCounts: {
          ACTIVE_MAIL: 1,
          TRASH: 2,
        },
        trashCount: 2,
        unreadCount: 2,
      }),
    );
  });
});