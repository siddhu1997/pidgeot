import { describe, expect, it } from "vitest";

import { GmailErrorCategory, mapGmailError } from "@/lib/gmail/error-map";

describe("mapGmailError", () => {
  it("maps invalid credentials to reauth-safe category", () => {
    expect(
      mapGmailError({
        response: {
          data: { error: "invalid_grant" },
          status: 401,
        },
        status: 401,
      }),
    ).toMatchObject({
      category: GmailErrorCategory.INVALID_REVOKED_CREDENTIAL,
      retryable: false,
    });
  });

  it("maps rate limit failures to retryable category", () => {
    expect(
      mapGmailError({
        response: {
          data: { error: { errors: [{ reason: "userRateLimitExceeded" }] } },
          status: 429,
        },
        status: 429,
      }),
    ).toMatchObject({
      category: GmailErrorCategory.RATE_LIMITED,
      retryable: true,
    });
  });
});