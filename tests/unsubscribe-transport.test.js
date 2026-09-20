import { describe, expect, it, vi } from "vitest";

import { createUnsubscribeRetryPolicy } from "@/lib/unsubscribe/retry-policy";
import { createUnsubscribeTransport } from "@/lib/unsubscribe/transport";

function createAutomaticOperation(overrides = {}) {
  return {
    host: "public.example",
    id: "uo_test_1",
    port: null,
    scheme: "https",
    status: "AUTOMATIC",
    target: "https://public.example/unsub",
    type: "RFC8058_ONE_CLICK",
    ...overrides,
  };
}

function createResolvedTarget(target) {
  const url = new URL(target);
  return {
    addresses: [{ address: "93.184.216.34", family: 4 }],
    hostname: url.hostname,
    port: url.port || "443",
    selectedAddress: { address: "93.184.216.34", family: 4 },
    url,
  };
}

describe("unsubscribe transport", () => {
  it("submits RFC 8058 operations with POST and minimal required headers only", async () => {
    const resolveTarget = vi.fn(async (target) => createResolvedTarget(target));
    const sendPinnedHttpsRequest = vi.fn(async () => ({
      bodyPreview: "ok",
      headers: { "content-type": "text/plain" },
      statusCode: 204,
    }));
    const transport = createUnsubscribeTransport({
      resolveTarget,
      sendPinnedHttpsRequest,
    });

    const result = await transport.executeOperation(createAutomaticOperation());

    expect(result.status).toBe("SUCCESS");
    expect(resolveTarget).toHaveBeenCalledWith("https://public.example/unsub");
    expect(sendPinnedHttpsRequest).toHaveBeenCalledWith(expect.objectContaining({
      body: "list-unsubscribe=one-click",
      headers: {
        "content-length": 26,
        "content-type": "application/x-www-form-urlencoded",
      },
      method: "POST",
      signal: expect.any(AbortSignal),
      timeoutMs: 5000,
    }));
    expect(sendPinnedHttpsRequest.mock.calls[0][0].headers).not.toHaveProperty("authorization");
    expect(sendPinnedHttpsRequest.mock.calls[0][0].headers).not.toHaveProperty("cookie");
  });

  it("revalidates and follows safe 307 redirects while blocking unsafe redirect targets", async () => {
    const resolvedTargets = [];
    const resolveTarget = vi.fn(async (target) => {
      resolvedTargets.push(target);

      if (target === "https://public.example/unsub") {
        return createResolvedTarget(target);
      }

      if (target === "https://redirected.example/final") {
        return createResolvedTarget(target);
      }

      if (target === "http://redirected.example/final") {
        const error = new Error("unsubscribe_target_requires_https");
        error.code = "unsubscribe_target_requires_https";
        throw error;
      }

      const error = new Error("unsubscribe_target_unsafe_hostname");
      error.code = "unsubscribe_target_unsafe_hostname";
      throw error;
    });
    const sendPinnedHttpsRequest = vi.fn()
      .mockResolvedValueOnce({
        bodyPreview: "",
        headers: { location: "https://redirected.example/final" },
        statusCode: 307,
      })
      .mockResolvedValueOnce({
        bodyPreview: "done",
        headers: { "content-type": "text/plain" },
        statusCode: 200,
      });
    const transport = createUnsubscribeTransport({
      resolveTarget,
      sendPinnedHttpsRequest,
    });

    const success = await transport.executeOperation(createAutomaticOperation());

    expect(success.status).toBe("SUCCESS");
    expect(resolvedTargets).toEqual([
      "https://public.example/unsub",
      "https://redirected.example/final",
    ]);

    sendPinnedHttpsRequest.mockReset();
    sendPinnedHttpsRequest.mockResolvedValue({
      bodyPreview: "",
      headers: { location: "http://redirected.example/final" },
      statusCode: 307,
    });

    const httpRedirect = await transport.executeOperation(createAutomaticOperation());

    expect(httpRedirect.status).toBe("UNSAFE_TARGET");

    sendPinnedHttpsRequest.mockReset();
    sendPinnedHttpsRequest.mockResolvedValue({
      bodyPreview: "",
      headers: { location: "https://localhost/final" },
      statusCode: 307,
    });

    const localhostRedirect = await transport.executeOperation(createAutomaticOperation());

    expect(localhostRedirect.status).toBe("UNSAFE_TARGET");
  });

  it("limits redirects and blocks redirect loops", async () => {
    const transport = createUnsubscribeTransport({
      maxRedirects: 1,
      resolveTarget: async (target) => createResolvedTarget(target),
      sendPinnedHttpsRequest: vi.fn(async ({ resolvedTarget }) => ({
        bodyPreview: "",
        headers: { location: `${resolvedTarget.url.origin}/again` },
        statusCode: 307,
      })),
    });

    const result = await transport.executeOperation(createAutomaticOperation());

    expect(result.status).toBe("FAILED_PERMANENT");
    expect(result.httpStatus).toBe(307);
  });

  it("retries 429 and selected 5xx responses using the retry policy", async () => {
    const sleep = vi.fn(async () => {});
    const retryPolicy = createUnsubscribeRetryPolicy({ maxAttempts: 2, sleep });
    const sendPinnedHttpsRequest = vi.fn()
      .mockResolvedValueOnce({
        bodyPreview: "",
        headers: { "retry-after": "1" },
        statusCode: 429,
      })
      .mockResolvedValueOnce({
        bodyPreview: "ok",
        headers: { "content-type": "text/plain" },
        statusCode: 200,
      });
    const transport = createUnsubscribeTransport({
      resolveTarget: async (target) => createResolvedTarget(target),
      retryPolicy,
      sendPinnedHttpsRequest,
    });

    const rateLimited = await transport.executeOperation(createAutomaticOperation());

    expect(rateLimited.status).toBe("SUCCESS");
    expect(sleep).toHaveBeenCalledTimes(1);

    sendPinnedHttpsRequest.mockReset();
    sendPinnedHttpsRequest
      .mockResolvedValueOnce({ bodyPreview: "", headers: {}, statusCode: 503 })
      .mockResolvedValueOnce({ bodyPreview: "ok", headers: {}, statusCode: 204 });

    const serverFailure = await transport.executeOperation(createAutomaticOperation());

    expect(serverFailure.status).toBe("SUCCESS");
    expect(sendPinnedHttpsRequest).toHaveBeenCalledTimes(2);
  });

  it("classifies permanent failures, auth-required flows, manual pages, timeouts, and oversized responses conservatively", async () => {
    const resolveTarget = async (target) => createResolvedTarget(target);

    const permanentTransport = createUnsubscribeTransport({
      resolveTarget,
      sendPinnedHttpsRequest: async () => ({
        bodyPreview: "gone",
        headers: {},
        statusCode: 410,
      }),
    });
    expect((await permanentTransport.executeOperation(createAutomaticOperation())).status).toBe("FAILED_PERMANENT");

    const authTransport = createUnsubscribeTransport({
      resolveTarget,
      sendPinnedHttpsRequest: async () => ({
        bodyPreview: "sign in required",
        headers: { "content-type": "text/html" },
        statusCode: 401,
      }),
    });
    expect((await authTransport.executeOperation(createAutomaticOperation())).status).toBe("MANUAL_ACTION_REQUIRED");

    const captchaTransport = createUnsubscribeTransport({
      resolveTarget,
      sendPinnedHttpsRequest: async () => ({
        bodyPreview: "Please complete CAPTCHA",
        headers: { "content-type": "text/html" },
        statusCode: 200,
      }),
    });
    expect((await captchaTransport.executeOperation(createAutomaticOperation())).status).toBe("MANUAL_ACTION_REQUIRED");

    const timeoutTransport = createUnsubscribeTransport({
      resolveTarget,
      sendPinnedHttpsRequest: async () => {
        const error = new Error("timeout");
        error.code = "unsubscribe_request_timeout";
        error.retryable = true;
        throw error;
      },
    });
    expect((await timeoutTransport.executeOperation(createAutomaticOperation())).status).toBe("FAILED_RETRYABLE");

    const oversizedTransport = createUnsubscribeTransport({
      resolveTarget,
      sendPinnedHttpsRequest: async () => {
        const error = new Error("too large");
        error.code = "unsubscribe_response_too_large";
        throw error;
      },
    });
    expect((await oversizedTransport.executeOperation(createAutomaticOperation())).status).toBe("FAILED_PERMANENT");
  });

  it("bounds stalled DNS resolution with the operation timeout and keeps timeout classification retryable", async () => {
    vi.useFakeTimers();

    try {
      const resolveTarget = vi.fn(() => new Promise(() => {}));
      const sendPinnedHttpsRequest = vi.fn();
      const transport = createUnsubscribeTransport({
        requestTimeoutMs: 25,
        resolveTarget,
        retryPolicy: createUnsubscribeRetryPolicy({ maxAttempts: 1, sleep: vi.fn(async () => {}) }),
        sendPinnedHttpsRequest,
      });

      const executionPromise = transport.executeOperation(createAutomaticOperation());

      await vi.advanceTimersByTimeAsync(25);

      await expect(executionPromise).resolves.toEqual(expect.objectContaining({
        operationId: "uo_test_1",
        operationType: "RFC8058_ONE_CLICK",
        retryAfterMs: null,
        status: "FAILED_RETRYABLE",
      }));
      expect(sendPinnedHttpsRequest).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("still passes the validated target into the pinned request after successful DNS resolution", async () => {
    const resolvedTarget = createResolvedTarget("https://public.example/unsub");
    const resolveTarget = vi.fn(async () => resolvedTarget);
    const sendPinnedHttpsRequest = vi.fn(async ({ resolvedTarget: pinnedTarget }) => {
      expect(pinnedTarget).toBe(resolvedTarget);

      return {
        bodyPreview: "ok",
        headers: { "content-type": "text/plain" },
        statusCode: 204,
      };
    });
    const transport = createUnsubscribeTransport({
      resolveTarget,
      sendPinnedHttpsRequest,
    });

    const result = await transport.executeOperation(createAutomaticOperation());

    expect(result.status).toBe("SUCCESS");
    expect(resolveTarget).toHaveBeenCalledTimes(1);
  });

  it("gives each redirect hop its own bounded timeout window", async () => {
    vi.useFakeTimers();

    try {
      const resolveTarget = vi.fn(async (target) => createResolvedTarget(target));
      const sendPinnedHttpsRequest = vi.fn()
        .mockResolvedValueOnce({
          bodyPreview: "",
          headers: { location: "https://redirected.example/final" },
          statusCode: 307,
        })
        .mockImplementationOnce(async () => new Promise(() => {}));
      const transport = createUnsubscribeTransport({
        requestTimeoutMs: 30,
        resolveTarget,
        retryPolicy: createUnsubscribeRetryPolicy({ maxAttempts: 1, sleep: vi.fn(async () => {}) }),
        sendPinnedHttpsRequest,
      });

      const executionPromise = transport.executeOperation(createAutomaticOperation());

      await vi.advanceTimersByTimeAsync(30);

      await expect(executionPromise).resolves.toEqual(expect.objectContaining({
        status: "FAILED_RETRYABLE",
      }));
      expect(resolveTarget).toHaveBeenNthCalledWith(1, "https://public.example/unsub");
      expect(resolveTarget).toHaveBeenNthCalledWith(2, "https://redirected.example/final");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not introduce an uncontrolled second DNS lookup because the pinned request still receives a prevalidated target only", async () => {
    const resolveTarget = vi.fn(async (target) => createResolvedTarget(target));
    const sendPinnedHttpsRequest = vi.fn(async ({ resolvedTarget, signal }) => {
      expect(resolvedTarget.hostname).toBe("public.example");
      expect(resolvedTarget.selectedAddress).toEqual({
        address: "93.184.216.34",
        family: 4,
      });
      expect(signal).toBeInstanceOf(AbortSignal);

      return {
        bodyPreview: "ok",
        headers: { "content-type": "text/plain" },
        statusCode: 204,
      };
    });
    const transport = createUnsubscribeTransport({
      resolveTarget,
      sendPinnedHttpsRequest,
    });

    await transport.executeOperation(createAutomaticOperation());

    expect(resolveTarget).toHaveBeenCalledTimes(1);
    expect(sendPinnedHttpsRequest).toHaveBeenCalledTimes(1);
  });

  it("keeps mailto and unsupported mechanisms manual", async () => {
    const transport = createUnsubscribeTransport({
      resolveTarget: async (target) => createResolvedTarget(target),
      sendPinnedHttpsRequest: vi.fn(),
    });

    const mailtoResult = await transport.executeOperation({
      id: "uo_mailto",
      status: "MANUAL_ACTION_REQUIRED",
      type: "MAILTO",
    });
    const unsupportedResult = await transport.executeOperation({
      id: "uo_https",
      status: "MANUAL_ACTION_REQUIRED",
      type: "HTTPS_LINK",
    });

    expect(mailtoResult.status).toBe("MANUAL_ACTION_REQUIRED");
    expect(unsupportedResult.status).toBe("MANUAL_ACTION_REQUIRED");
  });
});