import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { buildOAuthStateCookieOptions } from "@/lib/auth/cookies";
import { getActiveSessionStore } from "@/lib/auth/active-session-store";
import {
  ACTIVE_SESSION_COOKIE_NAME,
  GOOGLE_AUTH_FLOWS,
  OAUTH_STATE_COOKIE_NAME,
} from "@/lib/auth/constants";
import { createPkceCodeChallenge, createPkceCodeVerifier } from "@/lib/auth/crypto";
import { createGoogleAuthUrl } from "@/lib/auth/google";
import { oauthStateStore } from "@/lib/auth/oauth-state-store";
import { getServerAppConfig, isAuthConfigured } from "@/lib/config";
import { recoverDevelopmentWorkflowScenario } from "@/lib/dev-lab/workflow-scenario-guard";

export const runtime = "nodejs";

function redirectWithStatus(config, key, value) {
  const url = new URL("/", `${config.appBaseUrl}/`);
  url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

async function startGmailGoogleAuth(request) {
  const config = getServerAppConfig();

  if (!isAuthConfigured(config)) {
    return redirectWithStatus(config, "authError", "config");
  }

  const cookieStore = await cookies();
  const existingSessionId = cookieStore.get(ACTIVE_SESSION_COOKIE_NAME)?.value || null;
  const existingSession = existingSessionId
    ? getActiveSessionStore(config).getSession(existingSessionId)
    : null;

  if (!config.isProduction && recoverDevelopmentWorkflowScenario(existingSession)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const codeVerifier = createPkceCodeVerifier();
  const codeChallenge = createPkceCodeChallenge(codeVerifier);
  const stateRecord = oauthStateStore.createState({
    authFlow: GOOGLE_AUTH_FLOWS.GMAIL,
    codeVerifier,
    existingSessionId: existingSession?.id || null,
  });
  const authUrl = createGoogleAuthUrl({
    authFlow: GOOGLE_AUTH_FLOWS.GMAIL,
    config,
    state: stateRecord.state,
    codeChallenge,
  });

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(
    OAUTH_STATE_COOKIE_NAME,
    stateRecord.state,
    buildOAuthStateCookieOptions(config),
  );
  return response;
}

export async function GET(request) {
  return startGmailGoogleAuth(request);
}

export async function POST(request) {
  return startGmailGoogleAuth(request);
}