import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_AUTOMATIC_UNSUBSCRIBE_LEASE_LIMIT,
  DEFAULT_CLEANUP_MUTATION_CONCURRENCY,
  DEFAULT_SCAN_METADATA_CONCURRENCY,
  DEFAULT_SCAN_MAX_RETAINED_MESSAGES,
  DEFAULT_SCAN_PAGE_SIZE,
  DEFAULT_SESSION_TTL_HOURS,
  DEFAULT_UNSUBSCRIBE_EXECUTION_CONCURRENCY,
  DEFAULT_UNSUBSCRIBE_MAX_REDIRECTS,
  DEFAULT_UNSUBSCRIBE_MAX_RESPONSE_BYTES,
  DEFAULT_UNSUBSCRIBE_REQUEST_TIMEOUT_MS,
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
    vi.stubEnv("SCAN_PAGE_SIZE", "40");
    vi.stubEnv("SCAN_METADATA_CONCURRENCY", "6");
    vi.stubEnv("SCAN_MAX_RETAINED_MESSAGES", "9000");
    vi.stubEnv("CLEANUP_MUTATION_CONCURRENCY", "4");
    vi.stubEnv("UNSUBSCRIBE_EXECUTION_CONCURRENCY", "3");
    vi.stubEnv("AUTOMATIC_UNSUBSCRIBE_LEASE_LIMIT", "4500");
    vi.stubEnv("UNSUBSCRIBE_MAX_REDIRECTS", "4");
    vi.stubEnv("UNSUBSCRIBE_MAX_RESPONSE_BYTES", "2048");
    vi.stubEnv("UNSUBSCRIBE_REQUEST_TIMEOUT_MS", "7000");
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
      cleanupMutationConcurrency: 4,
      scanMetadataConcurrency: 6,
      scanMaxRetainedMessages: 9000,
      scanPageSize: 40,
      automaticUnsubscribeLeaseLimit: 4500,
      unsubscribeExecutionConcurrency: 3,
      unsubscribeMaxRedirects: 4,
      unsubscribeMaxResponseBytes: 2048,
      unsubscribeRequestTimeoutMs: 7000,
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

  it("defaults the scan limits to conservative shared configuration", () => {
    vi.unstubAllEnvs();

    expect(getServerAppConfig().scanPageSize).toBe(DEFAULT_SCAN_PAGE_SIZE);
    expect(getServerAppConfig().scanMetadataConcurrency).toBe(DEFAULT_SCAN_METADATA_CONCURRENCY);
    expect(getServerAppConfig().scanMaxRetainedMessages).toBe(DEFAULT_SCAN_MAX_RETAINED_MESSAGES);
    expect(getServerAppConfig().cleanupMutationConcurrency).toBe(DEFAULT_CLEANUP_MUTATION_CONCURRENCY);
    expect(getServerAppConfig().unsubscribeExecutionConcurrency).toBe(DEFAULT_UNSUBSCRIBE_EXECUTION_CONCURRENCY);
    expect(getServerAppConfig().automaticUnsubscribeLeaseLimit).toBe(DEFAULT_AUTOMATIC_UNSUBSCRIBE_LEASE_LIMIT);
    expect(getServerAppConfig().unsubscribeMaxRedirects).toBe(DEFAULT_UNSUBSCRIBE_MAX_REDIRECTS);
    expect(getServerAppConfig().unsubscribeMaxResponseBytes).toBe(DEFAULT_UNSUBSCRIBE_MAX_RESPONSE_BYTES);
    expect(getServerAppConfig().unsubscribeRequestTimeoutMs).toBe(DEFAULT_UNSUBSCRIBE_REQUEST_TIMEOUT_MS);
  });
});