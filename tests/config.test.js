import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_SESSION_TTL_HOURS,
  getPublicAppConfig,
  getServerAppConfig,
  isAuthConfigured,
} from "@/lib/config";

describe("getPublicAppConfig", () => {
  it("returns normalized values from the environment", () => {
    vi.stubEnv("APP_BASE_URL", "https://pidgeot.local/");
    vi.stubEnv("GITHUB_URL", "https://github.com/acme/pidgeot/");

    expect(getPublicAppConfig()).toEqual({
      appBaseUrl: "https://pidgeot.local",
      githubUrl: "https://github.com/acme/pidgeot",
    });
  });

  it("falls back when the environment is missing or invalid", () => {
    vi.stubEnv("APP_BASE_URL", "not a url");
    vi.unstubAllEnvs();

    expect(getPublicAppConfig()).toEqual({
      appBaseUrl: "http://localhost:3000",
      githubUrl: "https://github.com/example/pidgeot",
    });
  });

  it("reads server auth configuration and auth readiness", () => {
    vi.stubEnv("APP_BASE_URL", "https://app.pidgeot.test");
    vi.stubEnv("GITHUB_URL", "https://github.com/acme/pidgeot");
    vi.stubEnv("SESSION_SECRET", "super-secret");
    vi.stubEnv("SESSION_TTL_HOURS", "8");
    vi.stubEnv("GOOGLE_CLIENT_ID", "client-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "client-secret");
    vi.stubEnv("GOOGLE_REDIRECT_URI", "https://app.pidgeot.test/api/auth/google/callback");

    const config = getServerAppConfig();

    expect(config).toMatchObject({
      appBaseUrl: "https://app.pidgeot.test",
      githubUrl: "https://github.com/acme/pidgeot",
      sessionSecret: "super-secret",
      sessionTtlHours: 8,
      processingLeaseTtlSeconds: 120,
      googleClientId: "client-id",
      googleClientSecret: "client-secret",
      googleRedirectUri: "https://app.pidgeot.test/api/auth/google/callback",
    });
    expect(isAuthConfigured(config)).toBe(true);
  });

  it("defaults the session ttl to the shared 24-hour configuration", () => {
    vi.unstubAllEnvs();

    expect(getServerAppConfig().sessionTtlHours).toBe(DEFAULT_SESSION_TTL_HOURS);
  });
});