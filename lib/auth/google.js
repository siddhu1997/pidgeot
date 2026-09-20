import { OAuth2Client } from "google-auth-library";

import { GMAIL_AUTH_SCOPES, GOOGLE_AUTH_FLOWS, IDENTITY_AUTH_SCOPES } from "@/lib/auth/constants";

export function createGoogleOAuthClient(config) {
  return new OAuth2Client({
    clientId: config.googleClientId,
    clientSecret: config.googleClientSecret,
    redirectUri: config.googleRedirectUri,
  });
}

function getGoogleFlowOptions(authFlow) {
  if (authFlow === GOOGLE_AUTH_FLOWS.GMAIL) {
    return {
      accessType: "offline",
      prompt: "consent select_account",
      scopes: GMAIL_AUTH_SCOPES,
    };
  }

  return {
    accessType: "online",
    prompt: "select_account",
    scopes: IDENTITY_AUTH_SCOPES,
  };
}

export function createGoogleAuthUrl({ authFlow = GOOGLE_AUTH_FLOWS.IDENTITY, config, state, codeChallenge }) {
  const client = createGoogleOAuthClient(config);
  const flowOptions = getGoogleFlowOptions(authFlow);

  return client.generateAuthUrl({
    access_type: flowOptions.accessType,
    include_granted_scopes: false,
    prompt: flowOptions.prompt,
    scope: flowOptions.scopes,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
}

export async function exchangeCodeForIdentity({ config, code, codeVerifier }) {
  const client = createGoogleOAuthClient(config);
  const { tokens } = await client.getToken({
    code,
    codeVerifier,
    redirect_uri: config.googleRedirectUri,
  });

  if (!tokens.id_token) {
    throw new Error("missing_id_token");
  }

  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token,
    audience: config.googleClientId,
  });
  const payload = ticket.getPayload();

  if (!payload?.email || !payload.sub || payload.email_verified !== true) {
    throw new Error("invalid_identity_payload");
  }

  return {
    accessToken: tokens.access_token || null,
    accessTokenExpiresAt: tokens.expiry_date || null,
    email: payload.email.toLowerCase(),
    googleSubject: payload.sub,
    grantedScopes: tokens.scope ? tokens.scope.split(" ") : [],
    refreshToken: tokens.refresh_token || null,
  };
}