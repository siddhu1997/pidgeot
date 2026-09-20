import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getActiveSessionStore } from "@/lib/auth/active-session-store";
import { buildOAuthStateCookieOptions, buildSessionCookieOptions, clearAuthCookies } from "@/lib/auth/cookies";
import {
  ACTIVE_SESSION_COOKIE_NAME,
  GMAIL_SESSION_STATES,
  GOOGLE_AUTH_FLOWS,
  OAUTH_STATE_COOKIE_NAME,
} from "@/lib/auth/constants";
import { areEqualOpaqueValues, deriveAccountKey } from "@/lib/auth/crypto";
import {
  createConsentRequiredGmailState,
  createGmailReadyState,
  createIdentityOnlyGmailState,
} from "@/lib/auth/gmail-session";
import { exchangeCodeForIdentity } from "@/lib/auth/google";
import { oauthStateStore } from "@/lib/auth/oauth-state-store";
import { getServerAppConfig, isAuthConfigured } from "@/lib/config";

export const runtime = "nodejs";

function buildRedirect(request, statusKey, statusValue) {
  const url = new URL("/", request.url);
  url.searchParams.set(statusKey, statusValue);
  return url;
}

function buildAuthRedirectResponse(request, key, value, config) {
  const response = NextResponse.redirect(buildRedirect(request, key, value));
  response.cookies.set(OAUTH_STATE_COOKIE_NAME, "", {
    ...buildOAuthStateCookieOptions(config),
    maxAge: 0,
  });
  return response;
}

export async function GET(request) {
  const config = getServerAppConfig();
  const cookieStore = await cookies();
  const stateFromCookie = cookieStore.get(OAUTH_STATE_COOKIE_NAME)?.value;
  const code = request.nextUrl.searchParams.get("code");
  const returnedState = request.nextUrl.searchParams.get("state");
  const googleError = request.nextUrl.searchParams.get("error");

  const cleanupResponse = buildAuthRedirectResponse(request, "auth", "cancelled", config);

  if (!isAuthConfigured(config)) {
    cleanupResponse.headers.set("location", buildRedirect(request, "authError", "config").toString());
    return cleanupResponse;
  }

  if (googleError) {
    cleanupResponse.headers.set("location", buildRedirect(request, "authError", "denied").toString());
    return cleanupResponse;
  }

  if (!code || !returnedState || !stateFromCookie || !areEqualOpaqueValues(stateFromCookie, returnedState)) {
    cleanupResponse.headers.set("location", buildRedirect(request, "authError", "state").toString());
    return cleanupResponse;
  }

  const stateRecord = oauthStateStore.consumeState(returnedState);

  if (!stateRecord) {
    cleanupResponse.headers.set("location", buildRedirect(request, "authError", "expired_state").toString());
    return cleanupResponse;
  }

  try {
    const exchangedSession = await exchangeCodeForIdentity({
      config,
      code,
      codeVerifier: stateRecord.codeVerifier,
    });
    const accountKey = deriveAccountKey(exchangedSession.googleSubject, config.sessionSecret);
    const sessionStore = getActiveSessionStore(config);
    const existingSession = stateRecord.existingSessionId
      ? sessionStore.getSession(stateRecord.existingSessionId)
      : null;

    let session;
    let authStatus = "success";

    if (stateRecord.authFlow === GOOGLE_AUTH_FLOWS.GMAIL) {
      const gmailState = exchangedSession.refreshToken
        ? createGmailReadyState({
            accessToken: exchangedSession.accessToken,
            accessTokenExpiresAt: exchangedSession.accessTokenExpiresAt,
            grantedScopes: exchangedSession.grantedScopes,
            refreshToken: exchangedSession.refreshToken,
          })
        : createConsentRequiredGmailState();

      authStatus = exchangedSession.refreshToken ? "gmail_connected" : "gmail_consent_required";

      if (existingSession && existingSession.accountKey === accountKey) {
        session = sessionStore.updateSession(existingSession.id, (currentSession) => ({
          ...currentSession,
          accountKey,
          email: exchangedSession.email,
          gmail: gmailState,
          googleSubject: exchangedSession.googleSubject,
        }));
      } else {
        if (existingSession) {
          sessionStore.destroySession(existingSession.id);
        }

        session = sessionStore.createSession({
          accountKey,
          email: exchangedSession.email,
          gmail: gmailState,
          googleSubject: exchangedSession.googleSubject,
        });
      }
    } else {
      session = sessionStore.createSession({
        email: exchangedSession.email,
        accountKey,
        gmail: createIdentityOnlyGmailState(),
        googleSubject: exchangedSession.googleSubject,
      });
    }

    const response = NextResponse.redirect(buildRedirect(request, "auth", authStatus));
    response.cookies.set(
      ACTIVE_SESSION_COOKIE_NAME,
      session.id,
      buildSessionCookieOptions(config),
    );
    response.cookies.set(OAUTH_STATE_COOKIE_NAME, "", {
      ...buildOAuthStateCookieOptions(config),
      maxAge: 0,
    });
    return response;
  } catch {
    cleanupResponse.headers.set("location", buildRedirect(request, "authError", "exchange").toString());
    return cleanupResponse;
  }
}