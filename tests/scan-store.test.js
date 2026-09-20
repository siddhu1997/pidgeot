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
        { id: "a-1", source: SCAN_SOURCES.ACTIVE_MAIL },
        { id: "a-2", source: SCAN_SOURCES.ACTIVE_MAIL },
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
      normalizedMessages: [{ id: "dup-1", source: SCAN_SOURCES.ACTIVE_MAIL }],
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
      { id: "dup-1", source: SCAN_SOURCES.ACTIVE_MAIL },
    ]);
    expect(scanStore.getSanitizedScanForSession("session-1")).not.toHaveProperty("normalizedMessagesById");
  });
});