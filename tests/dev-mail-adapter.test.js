import { describe, expect, it } from "vitest";

import { createDevMailAdapter } from "@/lib/dev-mail/adapter";
import { createDevMailDeliveryStore } from "@/lib/dev-mail/delivery-store";
import { DEV_MAIL_ERROR_KINDS, classifyProviderError, sanitizeProviderFailure } from "@/lib/dev-mail/errors";
import { createDevMailMessage, createRfcMessageId } from "@/lib/dev-mail/message";

function createMessage(id = "devmail_17_0_0") {
  return createDevMailMessage({
    date: "Tue, 01 Sep 2026 14:30:00 GMT",
    fromAddress: "pixel@pidgeot-dev.siddharths.co.in",
    fromName: "Pixel Offers",
    html: "<p>Hello</p>",
    id,
    listId: "<pixel-offers.pidgeot-dev.siddharths.co.in>",
    listUnsubscribe: "<https://example.test/api/dev-lab/unsubscribe?token=dl_17_pixel-offers_rfc8058_one_click>",
    listUnsubscribePost: "List-Unsubscribe=One-Click",
    messageId: createRfcMessageId(id, "pidgeot-dev.siddharths.co.in"),
    precedence: "bulk",
    replyTo: "pixel@pidgeot-dev.siddharths.co.in",
    subject: "A modest sale",
    text: "Hello",
    toAddress: "inbox@example.test",
  });
}

function createFailingProvider(id, error) {
  return {
    configured: true,
    id,
    label: id,
    async send() {
      throw error;
    },
  };
}

describe("dev-mail error classification", () => {
  it("classifies auth and 5xx as permanent, 4xx and timeouts as transient, DATA timeouts as ambiguous", () => {
    expect(classifyProviderError({ code: "EAUTH", responseCode: 535 })).toEqual({
      kind: DEV_MAIL_ERROR_KINDS.PERMANENT,
      reason: "authentication_failed",
    });
    expect(classifyProviderError({ responseCode: 550, message: "User unknown" })).toMatchObject({
      kind: DEV_MAIL_ERROR_KINDS.PERMANENT,
    });
    expect(classifyProviderError({ code: "ETIMEDOUT", command: "CONN" })).toEqual({
      kind: DEV_MAIL_ERROR_KINDS.TRANSIENT,
      reason: "temporary_provider_failure",
    });
    expect(classifyProviderError({ responseCode: 421, message: "rate limit" })).toEqual({
      kind: DEV_MAIL_ERROR_KINDS.TRANSIENT,
      reason: "provider_throttled",
    });
    expect(classifyProviderError({ code: "ETIMEDOUT", command: "DATA" })).toEqual({
      kind: DEV_MAIL_ERROR_KINDS.AMBIGUOUS,
      reason: "delivery_unconfirmed",
    });
  });
});

describe("dev-mail adapter failover", () => {
  it("fails over to Mailgun only after a confirmed transient Brevo failure", async () => {
    const deliveryStore = createDevMailDeliveryStore({ store: new Map() });
    const adapter = createDevMailAdapter({
      config: { maxSendAttempts: 2, maxSendConcurrency: 1 },
      deliveryStore,
      providers: [
        createFailingProvider("brevo", sanitizeProviderFailure({
          classification: { kind: DEV_MAIL_ERROR_KINDS.TRANSIENT, reason: "temporary_provider_failure" },
          provider: "brevo",
        })),
        {
          configured: true,
          id: "mailgun",
          async send() {
            return { provider: "mailgun", status: "sent" };
          },
        },
      ],
    });

    const result = await adapter.send(createMessage());

    expect(result).toMatchObject({
      failoverCount: 1,
      provider: "mailgun",
      status: "sent",
    });
  });

  it("does not fail over permanent auth failures or ambiguous DATA timeouts", async () => {
    const authAdapter = createDevMailAdapter({
      config: { maxSendAttempts: 2, maxSendConcurrency: 1 },
      deliveryStore: createDevMailDeliveryStore({ store: new Map() }),
      providers: [
        createFailingProvider("brevo", sanitizeProviderFailure({
          classification: { kind: DEV_MAIL_ERROR_KINDS.PERMANENT, reason: "authentication_failed" },
          provider: "brevo",
        })),
        {
          configured: true,
          id: "mailgun",
          async send() {
            throw new Error("mailgun should not be called");
          },
        },
      ],
    });
    const authResult = await authAdapter.send(createMessage("devmail_17_0_1"));
    expect(authResult.status).toBe("failed");
    expect(authResult.provider).toBe("brevo");
    expect(authResult.failoverCount).toBe(0);

    const ambiguousAdapter = createDevMailAdapter({
      config: { maxSendAttempts: 2, maxSendConcurrency: 1 },
      deliveryStore: createDevMailDeliveryStore({ store: new Map() }),
      providers: [
        createFailingProvider("brevo", sanitizeProviderFailure({
          classification: { kind: DEV_MAIL_ERROR_KINDS.AMBIGUOUS, reason: "delivery_unconfirmed" },
          provider: "brevo",
        })),
        {
          configured: true,
          id: "mailgun",
          async send() {
            throw new Error("mailgun should not be called");
          },
        },
      ],
    });
    const ambiguousResult = await ambiguousAdapter.send(createMessage("devmail_17_0_2"));
    expect(ambiguousResult.status).toBe("ambiguous");
    expect(ambiguousResult.failoverCount).toBe(0);
  });
});
