import { GMAIL_SESSION_STATES } from "@/lib/auth/constants";
import { mapGmailError, GmailErrorCategory } from "@/lib/gmail/error-map";

const ACCESS_TOKEN_REFRESH_SKEW_MS = 60 * 1000;

export function createIdentityOnlyGmailState(now = Date.now()) {
  return {
    accessToken: null,
    accessTokenExpiresAt: null,
    grantedScopes: [],
    refreshToken: null,
    state: GMAIL_SESSION_STATES.IDENTITY_ONLY,
    updatedAt: now,
  };
}

export function createGmailReadyState(
  { accessToken = null, accessTokenExpiresAt = null, grantedScopes = [], refreshToken = null },
  now = Date.now(),
) {
  return {
    accessToken,
    accessTokenExpiresAt,
    grantedScopes,
    refreshToken,
    state: GMAIL_SESSION_STATES.GMAIL_READY,
    updatedAt: now,
  };
}

export function createConsentRequiredGmailState(now = Date.now()) {
  return {
    accessToken: null,
    accessTokenExpiresAt: null,
    grantedScopes: [],
    refreshToken: null,
    state: GMAIL_SESSION_STATES.CONSENT_REQUIRED,
    updatedAt: now,
  };
}

export function createReauthRequiredGmailState(now = Date.now()) {
  return {
    accessToken: null,
    accessTokenExpiresAt: null,
    grantedScopes: [],
    refreshToken: null,
    state: GMAIL_SESSION_STATES.REAUTH_REQUIRED,
    updatedAt: now,
  };
}

export function getSessionGmailState(session) {
  return session?.gmail || createIdentityOnlyGmailState();
}

export function getAccessTokenStatus(gmailState, now = Date.now()) {
  if (!gmailState?.accessToken) {
    return "unavailable";
  }

  if (!gmailState.accessTokenExpiresAt) {
    return "usable";
  }

  if (gmailState.accessTokenExpiresAt <= now) {
    return "expired";
  }

  if (gmailState.accessTokenExpiresAt <= now + ACCESS_TOKEN_REFRESH_SKEW_MS) {
    return "near_expiry";
  }

  return "usable";
}

export function isGmailReady(session) {
  return getSessionGmailState(session).state === GMAIL_SESSION_STATES.GMAIL_READY;
}

export function sanitizeSessionForClient(session) {
  return {
    accountKey: session.accountKey,
    email: session.email,
    expiresAt: session.expiresAt,
    gmailAuthState: getSessionGmailState(session).state,
  };
}

export function getCleanupSnapshotAssociation(session) {
  return {
    accountKey: session.accountKey,
  };
}

export async function ensureSessionHasUsableGmailAccessToken({
  config,
  now = () => Date.now(),
  oauthClientFactory,
  sessionId,
  sessionStore,
}) {
  const session = sessionStore.getSession(sessionId);

  if (!session) {
    const error = new Error("session_not_found");
    error.code = "session_not_found";
    throw error;
  }

  const gmailState = getSessionGmailState(session);

  if (gmailState.state !== GMAIL_SESSION_STATES.GMAIL_READY || !gmailState.refreshToken) {
    const error = new Error("gmail_reauth_required");
    error.code = "gmail_reauth_required";
    throw error;
  }

  if (getAccessTokenStatus(gmailState, now()) === "usable") {
    return {
      accessToken: gmailState.accessToken,
      session: sessionStore.getSession(sessionId),
    };
  }

  try {
    const oauthClient = oauthClientFactory(config);
    oauthClient.setCredentials({
      access_token: gmailState.accessToken || undefined,
      expiry_date: gmailState.accessTokenExpiresAt || undefined,
      refresh_token: gmailState.refreshToken,
    });

    const refreshResult = await oauthClient.refreshAccessToken();
    const nextCredentials = refreshResult.credentials || {};
    const updatedSession = sessionStore.updateSession(sessionId, (currentSession) => ({
      ...currentSession,
      gmail: createGmailReadyState(
        {
          accessToken: nextCredentials.access_token || currentSession.gmail.accessToken,
          accessTokenExpiresAt:
            nextCredentials.expiry_date || currentSession.gmail.accessTokenExpiresAt,
          grantedScopes: currentSession.gmail.grantedScopes,
          refreshToken: nextCredentials.refresh_token || currentSession.gmail.refreshToken,
        },
        now(),
      ),
    }));

    return {
      accessToken: updatedSession.gmail.accessToken,
      session: updatedSession,
    };
  } catch (error) {
    const mappedError = mapGmailError(error);

    if (
      mappedError.category === GmailErrorCategory.AUTHENTICATION_REQUIRED ||
      mappedError.category === GmailErrorCategory.INVALID_REVOKED_CREDENTIAL
    ) {
      sessionStore.updateSession(sessionId, (currentSession) => ({
        ...currentSession,
        gmail: createReauthRequiredGmailState(now()),
      }));
    }

    throw mappedError;
  }
}