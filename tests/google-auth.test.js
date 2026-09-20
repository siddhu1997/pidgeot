import { describe, expect, it } from "vitest";

import {
  GMAIL_AUTH_SCOPES,
  GMAIL_MODIFY_SCOPE,
  GOOGLE_AUTH_FLOWS,
  IDENTITY_AUTH_SCOPES,
} from "@/lib/auth/constants";
import { createGoogleAuthUrl } from "@/lib/auth/google";

function parseAuthUrl(url) {
  return new URL(url);
}

describe("google auth url generation", () => {
  const config = {
    googleClientId: "client-id",
    googleClientSecret: "client-secret",
    googleRedirectUri: "https://app.example.com/api/auth/google/callback",
  };

  it("keeps the identity-only flow scoped to openid and email", () => {
    const authUrl = parseAuthUrl(
      createGoogleAuthUrl({
        authFlow: GOOGLE_AUTH_FLOWS.IDENTITY,
        codeChallenge: "challenge",
        config,
        state: "state-a",
      }),
    );

    expect(authUrl.searchParams.get("access_type")).toBe("online");
    expect(authUrl.searchParams.get("scope")?.split(" ")).toEqual(IDENTITY_AUTH_SCOPES);
    expect(authUrl.searchParams.get("scope")).not.toContain(GMAIL_MODIFY_SCOPE);
  });

  it("requests gmail.modify and offline access only in the Gmail-capable flow", () => {
    const authUrl = parseAuthUrl(
      createGoogleAuthUrl({
        authFlow: GOOGLE_AUTH_FLOWS.GMAIL,
        codeChallenge: "challenge",
        config,
        state: "state-b",
      }),
    );

    expect(authUrl.searchParams.get("access_type")).toBe("offline");
    expect(authUrl.searchParams.get("prompt")).toContain("consent");
    expect(authUrl.searchParams.get("scope")?.split(" ")).toEqual(GMAIL_AUTH_SCOPES);
  });
});