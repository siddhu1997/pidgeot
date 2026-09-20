import { describe, expect, it, vi } from "vitest";

import { createGmailReadyState, createReauthRequiredGmailState } from "@/lib/auth/gmail-session";
import { GmailAppError, GmailErrorCategory } from "@/lib/gmail/error-map";
import { createProcessingLeaseStore } from "@/lib/sessions/processing-lease-store";
import {
  DEFAULT_SCAN_METADATA_HEADERS,
  SCAN_PAUSE_REASONS,
  SCAN_SOURCES,
  SCAN_STATES,
} from "@/lib/scanning/constants";
import { createScanService } from "@/lib/scanning/scanner";
import { createScanStore } from "@/lib/scanning/scan-store";

function createSession(overrides = {}) {
  return {
    accountKey: "account-key",
    email: "user@example.com",
    gmail: createGmailReadyState({
      accessToken: "token-a",
      accessTokenExpiresAt: Date.now() + 60_000,
      grantedScopes: ["scope-a"],
      refreshToken: "refresh-a",
    }),
    id: "session-1",
    ...overrides,
  };
}

function createSyntheticMailboxFixture({
  activePages = [],
  failGetForIds = new Map(),
  listFailures = new Map(),
  trashPages = [],
} = {}) {
  const pageReads = [];
  const metadataReads = [];
  let activeListCallCount = 0;
  let trashListCallCount = 0;
  let concurrentMetadata = 0;
  let maxConcurrentMetadata = 0;

  return {
    gmailClient: {
      async getMessageMetadata({ headers, messageId, sessionId }) {
        metadataReads.push({ headers, messageId, sessionId });
        concurrentMetadata += 1;
        maxConcurrentMetadata = Math.max(maxConcurrentMetadata, concurrentMetadata);

        try {
          const failure = failGetForIds.get(messageId);

          if (failure) {
            throw failure;
          }

          return {
            id: messageId,
            internalDate: "1700000000000",
            labelIds: messageId.startsWith("trash") ? ["TRASH"] : ["INBOX"],
            payload: {
              headers: headers.map((headerName) => {
                if (headerName === "From") {
                  return {
                    name: headerName,
                    value: `Sender ${messageId} <sender-${messageId}@example.com>`,
                  };
                }

                if (headerName === "List-Unsubscribe") {
                  return {
                    name: headerName,
                    value: `<mailto:leave-${messageId}@mailservice.example>`,
                  };
                }

                return {
                  name: headerName,
                  value: `${headerName}-value-${messageId}`,
                };
              }),
            },
            snippet: "should-not-leak",
            threadId: `thread-${messageId}`,
          };
        } finally {
          concurrentMetadata -= 1;
        }
      },
      async listMessagePage({ maxResults, pageToken, query, sessionId }) {
        pageReads.push({ maxResults, pageToken, query, sessionId });

        if (query === "-in:trash -in:spam") {
          const failure = listFailures.get(`active:${activeListCallCount}`);

          if (failure) {
            activeListCallCount += 1;
            throw failure;
          }

          const page = activePages[activeListCallCount] || { messages: [], nextPageToken: null };
          activeListCallCount += 1;
          return page;
        }

        const failure = listFailures.get(`trash:${trashListCallCount}`);

        if (failure) {
          trashListCallCount += 1;
          throw failure;
        }

        const page = trashPages[trashListCallCount] || { messages: [], nextPageToken: null };
        trashListCallCount += 1;
        return page;
      },
    },
    getSummary() {
      return {
        maxConcurrentMetadata,
        metadataReads,
        pageReads,
      };
    },
  };
}

describe("scan service", () => {
  it("paginates active mail and trash independently and reaches COMPLETE with partial results", async () => {
    const fixture = createSyntheticMailboxFixture({
      activePages: [
        { messages: [{ id: "active-1" }, { id: "active-2" }], nextPageToken: "active-page-2" },
        { messages: [{ id: "active-3" }], nextPageToken: null },
      ],
      trashPages: [
        { messages: [{ id: "trash-1" }], nextPageToken: "trash-page-2" },
        { messages: [{ id: "trash-2" }], nextPageToken: null },
      ],
    });
    const scanStore = createScanStore();
    const processingLeaseStore = createProcessingLeaseStore({ ttlMs: 1000 });
    const scanService = createScanService({
      config: {
        scanMetadataConcurrency: 3,
        scanPageSize: 2,
      },
      gmailClient: fixture.gmailClient,
      processingLeaseStore,
      scanStore,
    });
    const session = createSession();

    const startedScan = await scanService.startScan({ session });
    expect(startedScan.state).toBe(SCAN_STATES.PARTIAL_RESULTS_AVAILABLE);
    expect(startedScan.sourceSummaries.ACTIVE_MAIL.pagesProcessed).toBe(1);
    expect(startedScan.sourceSummaries.TRASH.pagesProcessed).toBe(0);

    await scanService.resumeScan({ session });
    await scanService.resumeScan({ session });
    const completedScan = await scanService.resumeScan({ session });

    expect(completedScan.state).toBe(SCAN_STATES.COMPLETE);
    expect(completedScan.counters.activeMessagesDiscovered).toBe(3);
    expect(completedScan.counters.trashMessagesDiscovered).toBe(2);
    expect(completedScan.counters.messagesNormalized).toBe(5);
    expect(completedScan.sourceSummaries.ACTIVE_MAIL.pagesProcessed).toBe(2);
    expect(completedScan.sourceSummaries.TRASH.pagesProcessed).toBe(2);

    const normalizedMessages = scanService.getNormalizedMessages({ sessionId: session.id });
    expect(normalizedMessages[0]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({
          from: "Sender active-1 <sender-active-1@example.com>",
          listUnsubscribe: "<mailto:leave-active-1@mailservice.example>",
          subject: "Subject-value-active-1",
        }),
        id: "active-1",
        source: SCAN_SOURCES.ACTIVE_MAIL,
      }),
    );
    expect(normalizedMessages.find((message) => message.id === "trash-1")).toEqual(
      expect.objectContaining({
        source: SCAN_SOURCES.TRASH,
      }),
    );
  });

  it("requests metadata-only retrieval with the scanner header set and no raw payload leakage", async () => {
    const fixture = createSyntheticMailboxFixture({
      activePages: [{ messages: [{ id: "active-1" }], nextPageToken: null }],
    });
    const scanService = createScanService({
      config: {
        scanMetadataConcurrency: 2,
        scanPageSize: 10,
      },
      gmailClient: fixture.gmailClient,
      processingLeaseStore: createProcessingLeaseStore({ ttlMs: 1000 }),
      scanStore: createScanStore(),
    });
    const session = createSession();

    await scanService.startScan({ session });

    expect(fixture.getSummary().metadataReads[0].headers).toEqual(DEFAULT_SCAN_METADATA_HEADERS);
    expect(scanService.getScanStatus({ session })).not.toHaveProperty("snippet");
    expect(scanService.getScanStatus({ session })).not.toHaveProperty("payload");
    expect(scanService.getNormalizedMessages({ sessionId: session.id })[0]).not.toHaveProperty("payload");
    expect(scanService.getScanStatus({ session }).senderGroups).toEqual([
      expect.objectContaining({
        attention: "LOW",
        addresses: [
          expect.objectContaining({
            canonicalAddress: "sender-active-1@example.com",
          }),
        ],
        category: "UNKNOWN",
        unsubscribe: {
          mechanisms: [
            expect.objectContaining({
              status: "MANUAL_ACTION_REQUIRED",
              type: "MAILTO",
            }),
          ],
          resolutionStatus: "MANUAL_ACTION_REQUIRED",
        },
      }),
    ]);
  });

  it("deduplicates repeated Gmail ids across overlapping pages and sources", async () => {
    const fixture = createSyntheticMailboxFixture({
      activePages: [{ messages: [{ id: "shared-1" }, { id: "active-2" }], nextPageToken: null }],
      trashPages: [{ messages: [{ id: "shared-1" }, { id: "trash-2" }], nextPageToken: null }],
    });
    const scanService = createScanService({
      config: {
        scanMetadataConcurrency: 2,
        scanPageSize: 10,
      },
      gmailClient: fixture.gmailClient,
      processingLeaseStore: createProcessingLeaseStore({ ttlMs: 1000 }),
      scanStore: createScanStore(),
    });
    const session = createSession();

    await scanService.startScan({ session });
    const status = await scanService.resumeScan({ session });

    expect(status.counters.messagesNormalized).toBe(3);
    expect(status.counters.duplicateMessageIds).toBe(1);
  });

  it("uses bounded metadata concurrency and incremental chunking for a large mailbox", async () => {
    const totalMessages = 10_000;
    const pageSize = 250;
    const activePages = Array.from({ length: totalMessages / pageSize }, (_, index) => ({
      messages: Array.from({ length: pageSize }, (_, messageOffset) => ({
        id: `active-${index * pageSize + messageOffset}`,
      })),
      nextPageToken: index === totalMessages / pageSize - 1 ? null : `page-${index + 1}`,
    }));
    const fixture = createSyntheticMailboxFixture({ activePages });
    const scanStore = createScanStore();
    const scanService = createScanService({
      config: {
        scanMetadataConcurrency: 4,
        scanPageSize: pageSize,
      },
      gmailClient: fixture.gmailClient,
      processingLeaseStore: createProcessingLeaseStore({ ttlMs: 1000 }),
      scanStore,
    });
    const session = createSession();

    let status = await scanService.startScan({ session });

    while (status.state !== SCAN_STATES.COMPLETE) {
      expect(status.sourceSummaries.ACTIVE_MAIL.pendingMessageCount).toBeLessThanOrEqual(pageSize);
      status = await scanService.resumeScan({ session });
    }

    expect(status.counters.messagesNormalized).toBe(totalMessages);
    expect(fixture.getSummary().maxConcurrentMetadata).toBeLessThanOrEqual(4);
    expect(scanService.getNormalizedMessages({ sessionId: session.id }).length).toBe(totalMessages);
  }, 15000);

  it("pauses cooperatively, resumes from checkpoint, and does not schedule new work while paused", async () => {
    const fixture = createSyntheticMailboxFixture({
      activePages: [
        { messages: [{ id: "active-1" }, { id: "active-2" }], nextPageToken: "page-2" },
        { messages: [{ id: "active-3" }], nextPageToken: null },
      ],
    });
    const scanStore = createScanStore();
    const processingLeaseStore = createProcessingLeaseStore({ ttlMs: 1000 });
    const scanService = createScanService({
      config: {
        scanMetadataConcurrency: 1,
        scanPageSize: 2,
      },
      gmailClient: fixture.gmailClient,
      processingLeaseStore,
      scanStore,
    });
    const session = createSession();

    await scanService.startScan({ session });
    const pausedScan = await scanService.pauseScan({ session });

    expect(pausedScan.state).toBe(SCAN_STATES.PAUSED);
    expect(pausedScan.pauseReason).toBe(SCAN_PAUSE_REASONS.USER_REQUESTED);
    expect(scanService.getScanStatus({ session }).sourceSummaries.ACTIVE_MAIL.pagesProcessed).toBe(1);

    const resumedScan = await scanService.resumeScan({ session });
    const completedActiveScan = await scanService.resumeScan({ session });

    expect(resumedScan.state).toBe(SCAN_STATES.PARTIAL_RESULTS_AVAILABLE);
    expect(resumedScan.counters.pagesProcessed).toBe(2);
    expect(completedActiveScan.sourceSummaries.ACTIVE_MAIL.pagesProcessed).toBe(2);
  });

  it("moves to REAUTH_REQUIRED when Gmail authentication becomes invalid", async () => {
    const fixture = createSyntheticMailboxFixture({
      activePages: [{ messages: [{ id: "active-1" }], nextPageToken: null }],
      failGetForIds: new Map([
        [
          "active-1",
          new GmailAppError({
            category: GmailErrorCategory.INVALID_REVOKED_CREDENTIAL,
            message: "reauth",
          }),
        ],
      ]),
    });
    const scanService = createScanService({
      config: {
        scanMetadataConcurrency: 1,
        scanPageSize: 10,
      },
      gmailClient: fixture.gmailClient,
      processingLeaseStore: createProcessingLeaseStore({ ttlMs: 1000 }),
      scanStore: createScanStore(),
    });
    const session = createSession();

    const status = await scanService.startScan({ session });

    expect(status.state).toBe(SCAN_STATES.REAUTH_REQUIRED);
    expect(status.failure).toEqual(
      expect.objectContaining({
        category: GmailErrorCategory.INVALID_REVOKED_CREDENTIAL,
      }),
    );
  });

  it("blocks new work after lease expiry while allowing already-finished work to count", async () => {
    let time = 0;
    const fixture = createSyntheticMailboxFixture({
      activePages: [{ messages: [{ id: "active-1" }, { id: "active-2" }], nextPageToken: "page-2" }],
    });
    const processingLeaseStore = createProcessingLeaseStore({ now: () => time, ttlMs: 1 });
    const scanStore = createScanStore();
    const scanService = createScanService({
      config: {
        scanMetadataConcurrency: 2,
        scanPageSize: 2,
      },
      gmailClient: {
        ...fixture.gmailClient,
        async getMessageMetadata(args) {
          const message = await fixture.gmailClient.getMessageMetadata(args);
          time = 10;
          return message;
        },
      },
      processingLeaseStore,
      scanStore,
    });
    const session = createSession();

    const status = await scanService.startScan({ session });

    expect(status.state).toBe(SCAN_STATES.PAUSED);
    expect(status.pauseReason).toBe(SCAN_PAUSE_REASONS.LEASE_EXPIRED);
    expect(status.counters.messagesNormalized).toBeGreaterThanOrEqual(1);
  });

  it("stops with RESOURCE_LIMIT_REACHED before scanning beyond the retained message budget", async () => {
    const fixture = createSyntheticMailboxFixture({
      activePages: [
        { messages: [{ id: "active-1" }, { id: "active-2" }], nextPageToken: "page-2" },
        { messages: [{ id: "active-3" }], nextPageToken: null },
      ],
    });
    const scanService = createScanService({
      config: {
        scanMaxRetainedMessages: 2,
        scanMetadataConcurrency: 2,
        scanPageSize: 2,
      },
      gmailClient: fixture.gmailClient,
      processingLeaseStore: createProcessingLeaseStore({ ttlMs: 1000 }),
      scanStore: createScanStore(),
    });
    const session = createSession();

    const limited = await scanService.startScan({ session });

    expect(limited.state).toBe(SCAN_STATES.RESOURCE_LIMIT_REACHED);
    expect(limited.counters.messagesNormalized).toBe(2);
    expect(limited.resourceLimit).toEqual(expect.objectContaining({
      code: "MAX_RETAINED_MESSAGES",
      currentMessageCount: 2,
      maxRetainedMessages: 2,
    }));
    expect(fixture.getSummary().metadataReads.map((entry) => entry.messageId)).toEqual(["active-1", "active-2"]);
  });

  it("fails safely on non-retryable list failures and keeps the error classification", async () => {
    const fixture = createSyntheticMailboxFixture({
      listFailures: new Map([
        [
          "active:0",
          new GmailAppError({
            category: GmailErrorCategory.MALFORMED_REQUEST,
            message: "bad-list",
          }),
        ],
      ]),
    });
    const scanService = createScanService({
      config: {
        scanMetadataConcurrency: 1,
        scanPageSize: 10,
      },
      gmailClient: fixture.gmailClient,
      processingLeaseStore: createProcessingLeaseStore({ ttlMs: 1000 }),
      scanStore: createScanStore(),
    });
    const session = createSession();

    const status = await scanService.startScan({ session });

    expect(status.state).toBe(SCAN_STATES.FAILED);
    expect(status.failure).toEqual(
      expect.objectContaining({
        category: GmailErrorCategory.MALFORMED_REQUEST,
      }),
    );
  });

  it("records individual metadata failures without destroying the entire scan", async () => {
    const fixture = createSyntheticMailboxFixture({
      activePages: [{ messages: [{ id: "active-1" }, { id: "active-2" }], nextPageToken: null }],
      failGetForIds: new Map([
        [
          "active-2",
          new GmailAppError({
            category: GmailErrorCategory.PERMANENT_API_FAILURE,
            message: "skip",
          }),
        ],
      ]),
    });
    const scanService = createScanService({
      config: {
        scanMetadataConcurrency: 2,
        scanPageSize: 10,
      },
      gmailClient: fixture.gmailClient,
      processingLeaseStore: createProcessingLeaseStore({ ttlMs: 1000 }),
      scanStore: createScanStore(),
    });
    const session = createSession();

    const status = await scanService.startScan({ session });

    expect(status.state).toBe(SCAN_STATES.PARTIAL_RESULTS_AVAILABLE);
    expect(status.counters.messagesNormalized).toBe(1);
    expect(status.counters.metadataFailures).toBe(1);
  });

  it("refuses to start when Gmail access is not ready", async () => {
    const scanService = createScanService({
      config: {
        scanMetadataConcurrency: 2,
        scanPageSize: 10,
      },
      gmailClient: createSyntheticMailboxFixture().gmailClient,
      processingLeaseStore: createProcessingLeaseStore({ ttlMs: 1000 }),
      scanStore: createScanStore(),
    });

    await expect(
      scanService.startScan({
        session: createSession({
          gmail: createReauthRequiredGmailState(),
        }),
      }),
    ).rejects.toMatchObject({
      category: GmailErrorCategory.AUTHENTICATION_REQUIRED,
    });
  });
});