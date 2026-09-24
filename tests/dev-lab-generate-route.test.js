import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/dev-mail/adapter", () => ({
  createDevMailAdapter() {
    return {
      async sendAll(messages) {
        return {
          ambiguousCount: 0,
          failedCount: 0,
          failoverCount: 0,
          providersUsed: ["brevo"],
          requestedCount: messages.length,
          results: messages.map((message) => ({
            error: null,
            failoverCount: 0,
            messageId: message.id,
            provider: "brevo",
            status: "sent",
          })),
          sentCount: messages.length,
        };
      },
    };
  },
}));

describe("dev-lab generate route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("is unavailable in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { POST } = await import("@/app/api/dev-lab/generate/route");

    const response = await POST(new Request("https://pidgeot.test/api/dev-lab/generate", {
      body: JSON.stringify({ senderCount: 2, messagesPerSender: 2 }),
      method: "POST",
    }));
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error.code).toBe("development_only");
  });

  it("rejects browser-supplied recipients and never returns SMTP credentials", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_MAIL_ENABLED", "true");
    vi.stubEnv("DEV_MAIL_RECIPIENT", "inbox@example.test");
    vi.stubEnv("DEV_MAIL_BREVO_SMTP_HOST", "smtp-relay.brevo.com");
    vi.stubEnv("DEV_MAIL_BREVO_SMTP_USER", "dev-brevo-user");
    vi.stubEnv("DEV_MAIL_BREVO_SMTP_PASSWORD", "super-secret-brevo-password");
    vi.stubEnv("DEV_MAIL_FROM_DOMAIN", "pidgeot-dev.siddharths.co.in");
    vi.stubEnv("DEV_MAIL_UNSUBSCRIBE_BASE_URL", "https://timmy-sclerenchymatous-unfanatically.ngrok-free.dev");

    const { POST } = await import("@/app/api/dev-lab/generate/route");

    const rejected = await POST(new Request("https://pidgeot.test/api/dev-lab/generate", {
      body: JSON.stringify({
        recipient: "attacker@example.com",
        senderCount: 2,
        messagesPerSender: 2,
      }),
      method: "POST",
    }));

    expect(rejected.status).toBe(400);

    const allowed = await POST(new Request("https://pidgeot.test/api/dev-lab/generate", {
      body: JSON.stringify({
        categoryProfile: "PROMOTIONAL",
        messagesPerSender: 2,
        seed: 17,
        senderCount: 2,
        unreadRatio: 0.5,
        unsubscribeProfile: "RFC8058_ONE_CLICK",
      }),
      method: "POST",
    }));
    const payload = await allowed.json();
    const serialized = JSON.stringify(payload);

    expect(allowed.status).toBe(200);
    expect(payload.generation.senderCount).toBe(2);
    expect(payload.generation.providersUsed).toEqual(["brevo"]);
    expect(serialized).not.toContain("super-secret-brevo-password");
    expect(serialized).not.toContain("dev-brevo-user");
    expect(serialized).not.toContain("attacker@example.com");
  });
});
