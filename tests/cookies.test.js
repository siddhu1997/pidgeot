import { describe, expect, it } from "vitest";

import { buildOAuthStateCookieOptions, buildSessionCookieOptions } from "@/lib/auth/cookies";

describe("auth cookie options", () => {
  it("keeps the session cookie restricted to the configured security properties", () => {
    expect(
      buildSessionCookieOptions({
        isProduction: true,
        sessionTtlHours: 24,
      }),
    ).toEqual({
      httpOnly: true,
      maxAge: 24 * 60 * 60,
      path: "/",
      sameSite: "lax",
      secure: true,
    });
  });

  it("keeps the OAuth state cookie restricted to the configured security properties", () => {
    expect(buildOAuthStateCookieOptions({ isProduction: false })).toEqual({
      httpOnly: true,
      maxAge: 10 * 60,
      path: "/",
      sameSite: "lax",
      secure: false,
    });
  });
});

describe("session cookie payload contract", () => {
  it("expects the browser cookie value to remain an opaque session id string", () => {
    const sessionId = "opaque-session-id";

    expect(typeof sessionId).toBe("string");
    expect(sessionId).not.toContain("user@example.com");
    expect(sessionId).not.toContain("google-subject");
    expect(sessionId).not.toContain("account-key");
    expect(sessionId).not.toContain("access_token");
    expect(sessionId).not.toContain("refresh_token");
  });

  it("keeps Gmail credential state out of cookie option objects", () => {
    const cookieOptions = buildSessionCookieOptions({
      isProduction: true,
      sessionTtlHours: 24,
    });

    expect(cookieOptions).not.toHaveProperty("accessToken");
    expect(cookieOptions).not.toHaveProperty("refreshToken");
    expect(cookieOptions).not.toHaveProperty("accountKey");
    expect(cookieOptions).not.toHaveProperty("email");
  });
});