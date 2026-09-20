import { describe, expect, it, vi } from "vitest";

import { GmailAppError, GmailErrorCategory } from "@/lib/gmail/error-map";
import { createGmailRetryPolicy } from "@/lib/gmail/retry-policy";

describe("gmail retry policy", () => {
  it("computes exponential backoff with jitter", () => {
    const retryPolicy = createGmailRetryPolicy({
      jitterMs: 1000,
      random: () => 0.5,
    });

    expect(retryPolicy.computeDelayMs(1)).toBe(1500);
    expect(retryPolicy.computeDelayMs(2)).toBe(2500);
  });

  it("respects Retry-After when present", () => {
    const retryPolicy = createGmailRetryPolicy();

    expect(retryPolicy.computeDelayMs(1, 7000)).toBe(7000);
  });

  it("retries transient failures but not authentication failures indefinitely", async () => {
    const sleep = vi.fn().mockResolvedValue();
    const retryPolicy = createGmailRetryPolicy({
      maxAttempts: 3,
      sleep,
    });
    const transientError = new GmailAppError({
      category: GmailErrorCategory.TRANSIENT_API_FAILURE,
      message: "retry",
      retryable: true,
    });
    const authError = new GmailAppError({
      category: GmailErrorCategory.INVALID_REVOKED_CREDENTIAL,
      message: "stop",
    });
    const task = vi
      .fn()
      .mockRejectedValueOnce(transientError)
      .mockResolvedValueOnce({ ok: true });

    await expect(retryPolicy.execute(task)).resolves.toEqual({ ok: true });
    expect(sleep).toHaveBeenCalledTimes(1);

    await expect(retryPolicy.execute(() => Promise.reject(authError))).rejects.toBe(authError);
  });
});