import { describe, expect, it, vi } from "vitest";

import { createActiveSessionStore } from "@/lib/auth/active-session-store";
import { GMAIL_SESSION_STATES } from "@/lib/auth/constants";
import {
  createGmailReadyState,
  ensureSessionHasUsableGmailAccessToken,
  getAccessTokenStatus,
  getCleanupSnapshotAssociation,
  sanitizeSessionForClient,
} from "@/lib/auth/gmail-session";

describe("gmail session helpers", () => {
  it("classifies access token states", () => {
    expect(getAccessTokenStatus({ accessToken: null }, 1000)).toBe("unavailable");
    expect(
      getAccessTokenStatus({ accessToken: "token", accessTokenExpiresAt: 1000 + 5 * 60 * 1000 }, 1000),
    ).toBe("usable");
    expect(
      getAccessTokenStatus({ accessToken: "token", accessTokenExpiresAt: 1000 + 30 * 1000 }, 1000),
    ).toBe("near_expiry");
    expect(
      getAccessTokenStatus({ accessToken: "token", accessTokenExpiresAt: 500 }, 1000),
    ).toBe("expired");
  });

  it("keeps refresh token out of client and snapshot-facing state", () => {
    const session = {
      accountKey: "account-key",
      email: "user@example.com",
      expiresAt: 999,
      gmail: createGmailReadyState({
        accessToken: "access-token",
        accessTokenExpiresAt: 888,
        grantedScopes: ["scope-a"],
        refreshToken: "refresh-token",
      }),
      googleSubject: "subject-1",
    };

    expect(sanitizeSessionForClient(session)).toEqual({
      email: "user@example.com",
      expiresAt: 999,
      gmailAuthState: GMAIL_SESSION_STATES.GMAIL_READY,
    });
    expect(getCleanupSnapshotAssociation(session)).toEqual({
      accountKey: "account-key",
    });
  });
});

describe("ensureSessionHasUsableGmailAccessToken", () => {
  it("reuses a valid access token", async () => {
    const sessionStore = createActiveSessionStore();
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

    const result = await ensureSessionHasUsableGmailAccessToken({
      config: {},
      oauthClientFactory: vi.fn(),
      sessionId: session.id,
      sessionStore,
    });

    expect(result.accessToken).toBe("token-a");
  });

  it("refreshes near-expiry and expired tokens in memory", async () => {
    const sessionStore = createActiveSessionStore();
    const session = sessionStore.createSession({
      accountKey: "account-key",
      email: "user@example.com",
      gmail: createGmailReadyState({
        accessToken: "token-old",
        accessTokenExpiresAt: Date.now() + 20 * 1000,
        grantedScopes: ["scope-a"],
        refreshToken: "refresh-a",
      }),
      googleSubject: "subject-a",
    });
    const refreshAccessToken = vi.fn().mockResolvedValue({
      credentials: {
        access_token: "token-new",
        expiry_date: Date.now() + 5 * 60 * 1000,
      },
    });

    const result = await ensureSessionHasUsableGmailAccessToken({
      config: {},
      oauthClientFactory: () => ({
        refreshAccessToken,
        setCredentials: vi.fn(),
      }),
      sessionId: session.id,
      sessionStore,
    });

    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(result.accessToken).toBe("token-new");
    expect(sessionStore.getSession(session.id).gmail.accessToken).toBe("token-new");
  });

  it("transitions to REAUTH_REQUIRED on invalid refresh token", async () => {
    const sessionStore = createActiveSessionStore();
    const session = sessionStore.createSession({
      accountKey: "account-key",
      email: "user@example.com",
      gmail: createGmailReadyState({
        accessToken: null,
        accessTokenExpiresAt: null,
        grantedScopes: ["scope-a"],
        refreshToken: "refresh-a",
      }),
      googleSubject: "subject-a",
    });

    await expect(
      ensureSessionHasUsableGmailAccessToken({
        config: {},
        oauthClientFactory: () => ({
          refreshAccessToken: vi.fn().mockRejectedValue({
            response: {
              data: { error: "invalid_grant" },
              status: 401,
            },
            status: 401,
          }),
          setCredentials: vi.fn(),
        }),
        sessionId: session.id,
        sessionStore,
      }),
    ).rejects.toMatchObject({
      category: "INVALID_REVOKED_CREDENTIAL",
    });

    expect(sessionStore.getSession(session.id).gmail.state).toBe(GMAIL_SESSION_STATES.REAUTH_REQUIRED);
  });

  it("distinguishes temporary refresh failures from permanent auth failure", async () => {
    const sessionStore = createActiveSessionStore();
    const session = sessionStore.createSession({
      accountKey: "account-key",
      email: "user@example.com",
      gmail: createGmailReadyState({
        accessToken: null,
        accessTokenExpiresAt: null,
        grantedScopes: ["scope-a"],
        refreshToken: "refresh-a",
      }),
      googleSubject: "subject-a",
    });

    await expect(
      ensureSessionHasUsableGmailAccessToken({
        config: {},
        oauthClientFactory: () => ({
          refreshAccessToken: vi.fn().mockRejectedValue({
            response: {
              data: { error: { errors: [{ reason: "backendError" }] } },
              status: 503,
            },
            status: 503,
          }),
          setCredentials: vi.fn(),
        }),
        sessionId: session.id,
        sessionStore,
      }),
    ).rejects.toMatchObject({
      category: "TRANSIENT_API_FAILURE",
    });

    expect(sessionStore.getSession(session.id).gmail.state).toBe(GMAIL_SESSION_STATES.GMAIL_READY);
  });
});