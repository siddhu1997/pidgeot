import { NextResponse } from "next/server";

import { buildOAuthStateCookieOptions } from "@/lib/auth/cookies";
import { GOOGLE_AUTH_FLOWS, OAUTH_STATE_COOKIE_NAME } from "@/lib/auth/constants";
import { createPkceCodeChallenge, createPkceCodeVerifier } from "@/lib/auth/crypto";
import { createGoogleAuthUrl } from "@/lib/auth/google";
import { oauthStateStore } from "@/lib/auth/oauth-state-store";
import { getServerAppConfig, isAuthConfigured } from "@/lib/config";

export const runtime = "nodejs";

function redirectWithStatus(request, key, value) {
  const url = new URL("/", request.url);
  url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

async function startGoogleAuth(request) {
  const config = getServerAppConfig();

  if (!isAuthConfigured(config)) {
    return redirectWithStatus(request, "authError", "config");
  }

  const codeVerifier = createPkceCodeVerifier();
  const codeChallenge = createPkceCodeChallenge(codeVerifier);
  const stateRecord = oauthStateStore.createState({
    authFlow: GOOGLE_AUTH_FLOWS.IDENTITY,
    codeVerifier,
  });
  const authUrl = createGoogleAuthUrl({
    authFlow: GOOGLE_AUTH_FLOWS.IDENTITY,
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
  return startGoogleAuth(request);
}

export async function POST(request) {
  return startGoogleAuth(request);
}