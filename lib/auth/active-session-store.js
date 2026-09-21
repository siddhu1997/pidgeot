import { createRandomToken } from "@/lib/auth/crypto";
import {
  createIdentityOnlyGmailState,
} from "@/lib/auth/gmail-session";
import { DEFAULT_SESSION_TTL_HOURS, SESSION_TTL_MS_PER_HOUR } from "@/lib/config";
import { getProcessingLeaseStore } from "@/lib/sessions/processing-lease-store";
import { getScanStore } from "@/lib/scanning/scan-store";
import { getWorkflowStore } from "@/lib/workflow/store";

export function createActiveSessionStore({
  now = () => Date.now(),
  onSessionDestroyed = () => {},
  sessionTtlMs = DEFAULT_SESSION_TTL_HOURS * SESSION_TTL_MS_PER_HOUR,
} = {}) {
  const sessionMap = new Map();

  function removeSession(sessionId) {
    const session = sessionMap.get(sessionId);

    if (!session) {
      return;
    }

    sessionMap.delete(sessionId);
    onSessionDestroyed(session);
  }

  function cleanupExpiredSessions() {
    const currentTime = now();

    for (const [sessionId, session] of sessionMap.entries()) {
      if (session.expiresAt <= currentTime) {
        removeSession(sessionId);
      }
    }
  }

  function createSession({ email, accountKey, googleSubject, gmail = null }) {
    cleanupExpiredSessions();

    const createdAt = now();
    const session = {
      id: createRandomToken(),
      email,
      gmail: gmail || createIdentityOnlyGmailState(createdAt),
      accountKey,
      googleSubject,
      createdAt,
      expiresAt: createdAt + sessionTtlMs,
    };

    sessionMap.set(session.id, session);
    return session;
  }

  function getSession(sessionId) {
    cleanupExpiredSessions();

    if (!sessionId) {
      return null;
    }

    return sessionMap.get(sessionId) || null;
  }

  function updateSession(sessionId, updater) {
    cleanupExpiredSessions();

    const currentSession = sessionMap.get(sessionId);

    if (!currentSession) {
      return null;
    }

    const nextSession = updater(currentSession);
    sessionMap.set(sessionId, nextSession);
    return nextSession;
  }

  function destroySession(sessionId) {
    if (!sessionId) {
      return;
    }

    removeSession(sessionId);
  }

  return {
    cleanupExpiredSessions,
    createSession,
    destroySession,
    getSession,
    updateSession,
  };
}

const ACTIVE_SESSION_STORE_KEY = "__pidgeotActiveSessionStore";

export function getActiveSessionStore(config) {
  if (globalThis[ACTIVE_SESSION_STORE_KEY]) {
    return globalThis[ACTIVE_SESSION_STORE_KEY];
  }

  const store = createActiveSessionStore({
    onSessionDestroyed: (session) => {
      getScanStore(config).destroyScanForSession(session.id);
      getProcessingLeaseStore(config).releaseLeasesForSession(session.id);
      getWorkflowStore().clearSession(session.id);
    },
    sessionTtlMs: config.sessionTtlHours * SESSION_TTL_MS_PER_HOUR,
  });

  globalThis[ACTIVE_SESSION_STORE_KEY] = store;

  return store;
}