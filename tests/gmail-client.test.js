import { describe, expect, it, vi } from "vitest";

import { createActiveSessionStore } from "@/lib/auth/active-session-store";
import {
  createGmailReadyState,
  createReauthRequiredGmailState,
} from "@/lib/auth/gmail-session";
import { createGmailClient } from "@/lib/gmail/client";
import { createGmailRetryPolicy } from "@/lib/gmail/retry-policy";
import { createProcessingLeaseStore } from "@/lib/sessions/processing-lease-store";

describe("gmail client foundation", () => {
  it("exposes only the active Gmail foundation boundary", () => {
    const gmailClient = createGmailClient({
      config: {},
      fetchImpl: vi.fn(),
      oauthClientFactory: vi.fn(),
      processingLeaseStore: createProcessingLeaseStore({ ttlMs: 1000 }),
      sessionStore: createActiveSessionStore(),
    });

    expect(gmailClient).toHaveProperty("getMessageMetadata");
    expect(gmailClient).toHaveProperty("listMessagePage");
    expect(gmailClient).not.toHaveProperty("getMessageFull");
    expect(gmailClient).not.toHaveProperty("trashMessage");
  });

  it("lists bounded pages using server-side Gmail credentials only", async () => {
    const sessionStore = createActiveSessionStore();
    const processingLeaseStore = createProcessingLeaseStore({ ttlMs: 1000 });
    const session = sessionStore.createSession({
      accountKey: "account-key",
      email: "user@example.com",
      gmail: createGmailReadyState({
        accessToken: "token-a",
        accessTokenExpiresAt: Date.now() + 10 * 60 * 1000,
        grantedScopes: ["scope-a"],
        refreshToken: "refresh-a",
      }),
      googleSubject: "subject-a",
    });
    const lease = processingLeaseStore.acquireLease({ sessionId: session.id });
    const fetchImpl = vi.fn().mockResolvedValue({
      json: async () => ({
        messages: [{ id: "message-1", threadId: "thread-1" }],
        nextPageToken: "page-2",
      }),
      ok: true,
    });
    const gmailClient = createGmailClient({
      config: {},
      fetchImpl,
      oauthClientFactory: vi.fn(),
      processingLeaseStore,
      sessionStore,
    });

    const result = await gmailClient.listMessagePage({
      leaseId: lease.id,
      maxResults: 25,
      pageToken: "page-1",
      query: "-in:trash -in:spam",
      sessionId: session.id,
    });

    expect(result).toEqual({
      messages: [{ id: "message-1", threadId: "thread-1" }],
      nextPageToken: "page-2",
    });
    expect(fetchImpl.mock.calls[0][0]).toContain("maxResults=25");
    expect(fetchImpl.mock.calls[0][0]).toContain("pageToken=page-1");
    expect(fetchImpl.mock.calls[0][0]).toContain("q=-in%3Atrash+-in%3Aspam");
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe("Bearer token-a");
  });

  it("requires valid processing ownership and server-side Gmail credentials", async () => {
    const sessionStore = createActiveSessionStore();
    const processingLeaseStore = createProcessingLeaseStore({ ttlMs: 1000 });
    const session = sessionStore.createSession({
      accountKey: "account-key",
      email: "user@example.com",
      gmail: createGmailReadyState({
        accessToken: "token-a",
        accessTokenExpiresAt: Date.now() + 10 * 60 * 1000,
        grantedScopes: ["scope-a"],
        refreshToken: "refresh-a",
      }),
      googleSubject: "subject-a",
    });
    const fetchImpl = vi.fn().mockResolvedValue({
      json: async () => ({ id: "message-1" }),
      ok: true,
    });
    const gmailClient = createGmailClient({
      config: {},
      fetchImpl,
      oauthClientFactory: vi.fn(),
      processingLeaseStore,
      sessionStore,
    });

    await expect(
      gmailClient.getMessageMetadata({
        leaseId: "missing-lease",
        messageId: "message-1",
        sessionId: session.id,
      }),
    ).rejects.toMatchObject({
      category: "AUTHENTICATION_REQUIRED",
    });

    const lease = processingLeaseStore.acquireLease({ sessionId: session.id });
    const result = await gmailClient.getMessageMetadata({
      headers: ["Subject"],
      leaseId: lease.id,
      messageId: "message-1",
      sessionId: session.id,
    });

    expect(result).toEqual({ id: "message-1" });
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe("Bearer token-a");
    expect(fetchImpl.mock.calls[0][0]).toContain("format=metadata");
  });

  it("blocks Gmail access when the session requires re-authentication", async () => {
    const sessionStore = createActiveSessionStore();
    const processingLeaseStore = createProcessingLeaseStore({ ttlMs: 1000 });
    const session = sessionStore.createSession({
      accountKey: "account-key",
      email: "user@example.com",
      gmail: createReauthRequiredGmailState(),
      googleSubject: "subject-a",
    });
    const lease = processingLeaseStore.acquireLease({ sessionId: session.id });
    const gmailClient = createGmailClient({
      config: {},
      fetchImpl: vi.fn(),
      oauthClientFactory: vi.fn(),
      processingLeaseStore,
      sessionStore,
    });

    await expect(
      gmailClient.getMessageMetadata({
        leaseId: lease.id,
        messageId: "message-1",
        sessionId: session.id,
      }),
    ).rejects.toMatchObject({
      category: "AUTHENTICATION_REQUIRED",
    });
  });

  it("keeps quota, retry, and error mapping centralized", async () => {
    const sessionStore = createActiveSessionStore();
    const processingLeaseStore = createProcessingLeaseStore({ ttlMs: 1000 });
    const session = sessionStore.createSession({
      accountKey: "account-key",
      email: "user@example.com",
      gmail: createGmailReadyState({
        accessToken: "token-a",
        accessTokenExpiresAt: Date.now() + 10 * 60 * 1000,
        grantedScopes: ["scope-a"],
        refreshToken: "refresh-a",
      }),
      googleSubject: "subject-a",
    });
    const lease = processingLeaseStore.acquireLease({ sessionId: session.id });
    const quotaPolicy = {
      recordConsumption: vi.fn().mockReturnValue({
        allowed: true,
        units: 20,
      }),
    };
    const retryPolicy = {
      execute: vi.fn(async (task) => task({ attemptNumber: 1 })),
    };
    const gmailClient = createGmailClient({
      config: {},
      fetchImpl: vi.fn().mockResolvedValue({
        headers: {
          get: () => null,
        },
        json: async () => ({ error: { errors: [{ reason: "userRateLimitExceeded" }] } }),
        ok: false,
        status: 429,
      }),
      oauthClientFactory: vi.fn(),
      processingLeaseStore,
      quotaPolicy,
      retryPolicy,
      sessionStore,
    });

    await expect(
      gmailClient.getMessageMetadata({
        leaseId: lease.id,
        messageId: "message-1",
        sessionId: session.id,
      }),
    ).rejects.toMatchObject({
      category: "RATE_LIMITED",
    });

    expect(quotaPolicy.recordConsumption).toHaveBeenCalledWith({
      methodName: "messages.get",
      userId: session.id,
    });
    expect(retryPolicy.execute).toHaveBeenCalledTimes(1);
  });
});