import { describe, expect, it } from "vitest";

import { createActiveSessionStore } from "@/lib/auth/active-session-store";
import { GMAIL_SESSION_STATES } from "@/lib/auth/constants";
import { createGmailReadyState } from "@/lib/auth/gmail-session";
import { DEFAULT_SESSION_TTL_HOURS, SESSION_TTL_MS_PER_HOUR } from "@/lib/config";

describe("active session store", () => {
  it("creates and returns sessions", () => {
    const sessionStore = createActiveSessionStore({ sessionTtlMs: 1000 });
    const session = sessionStore.createSession({
      email: "user@example.com",
      accountKey: "account-key",
      googleSubject: "subject-1",
    });

    expect(sessionStore.getSession(session.id)).toMatchObject({
      accountKey: "account-key",
      email: "user@example.com",
      gmail: {
        state: GMAIL_SESSION_STATES.IDENTITY_ONLY,
      },
      googleSubject: "subject-1",
    });
  });

  it("expires sessions based on ttl", () => {
    let time = 0;
    const sessionStore = createActiveSessionStore({
      now: () => time,
      sessionTtlMs: 100,
    });
    const session = sessionStore.createSession({
      email: "user@example.com",
      accountKey: "account-key",
      googleSubject: "subject-2",
    });

    time = 150;

    expect(sessionStore.getSession(session.id)).toBeNull();
  });

  it("uses the shared default ttl when none is provided", () => {
    const sessionStore = createActiveSessionStore({ now: () => 1000 });
    const session = sessionStore.createSession({
      email: "user@example.com",
      accountKey: "account-key",
      googleSubject: "subject-3",
    });

    expect(session.expiresAt).toBe(1000 + DEFAULT_SESSION_TTL_HOURS * SESSION_TTL_MS_PER_HOUR);
  });

  it("updates Gmail credential state in server memory only", () => {
    const sessionStore = createActiveSessionStore();
    const session = sessionStore.createSession({
      email: "user@example.com",
      accountKey: "account-key",
      googleSubject: "subject-4",
    });

    sessionStore.updateSession(session.id, (currentSession) => ({
      ...currentSession,
      gmail: createGmailReadyState({
        accessToken: "access-token",
        accessTokenExpiresAt: 123456,
        grantedScopes: ["scope-a"],
        refreshToken: "refresh-token",
      }),
    }));

    expect(sessionStore.getSession(session.id).gmail).toMatchObject({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      state: GMAIL_SESSION_STATES.GMAIL_READY,
    });
  });
});