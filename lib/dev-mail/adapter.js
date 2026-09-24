import { processWithConcurrency } from "@/lib/scanning/concurrency";
import { DEV_MAIL_ERROR_KINDS } from "@/lib/dev-mail/errors";
import { getDevMailDeliveryStore } from "@/lib/dev-mail/delivery-store";
import { createBrevoProvider } from "@/lib/dev-mail/providers/brevo";
import { createMailgunProvider } from "@/lib/dev-mail/providers/mailgun";

function createDevMailError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function configuredProviders(providers) {
  return providers.filter((provider) => provider.configured);
}

export function createDevMailAdapter({
  config,
  deliveryStore = getDevMailDeliveryStore(),
  providers,
} = {}) {
  const providerChain = providers || [
    createBrevoProvider(config),
    createMailgunProvider(config),
  ];

  async function send(message) {
    const available = configuredProviders(providerChain);

    if (available.length === 0) {
      throw createDevMailError(
        "provider_not_configured",
        "Neither Brevo nor Mailgun SMTP is fully configured.",
      );
    }

    const existing = deliveryStore.get(message.id);

    if (existing?.status === "sent") {
      return {
        failoverCount: 0,
        messageId: message.id,
        provider: existing.attempts.at(-1)?.provider || available[0].id,
        status: "sent",
      };
    }

    if (existing?.status === "ambiguous") {
      return {
        error: existing.attempts.at(-1)?.outcome || "ambiguous",
        failoverCount: 0,
        messageId: message.id,
        provider: existing.attempts.at(-1)?.provider || available[0].id,
        status: "ambiguous",
      };
    }

    let lastFailure = null;
    let failoverCount = 0;

    for (const [index, provider] of available.entries()) {
      if (index > 0) {
        failoverCount += 1;
      }

      try {
        await provider.send(message);
        deliveryStore.record({
          messageId: message.id,
          outcome: "sent",
          provider: provider.id,
        });
        return {
          failoverCount,
          messageId: message.id,
          provider: provider.id,
          status: "sent",
        };
      } catch (error) {
        lastFailure = error;
        deliveryStore.record({
          messageId: message.id,
          outcome: error.kind || "failed",
          provider: provider.id,
        });

        if (error.kind === DEV_MAIL_ERROR_KINDS.AMBIGUOUS) {
          return {
            error: error.message,
            failoverCount,
            messageId: message.id,
            provider: provider.id,
            status: "ambiguous",
          };
        }

        const canFailover = (
          error.kind === DEV_MAIL_ERROR_KINDS.TRANSIENT
          && index < available.length - 1
          && failoverCount < Math.max(0, (config.maxSendAttempts || 2) - 1)
        );

        if (!canFailover) {
          return {
            error: error.message,
            failoverCount,
            messageId: message.id,
            provider: provider.id,
            status: "failed",
          };
        }
      }
    }

    return {
      error: lastFailure?.message || "Development mail delivery failed.",
      failoverCount,
      messageId: message.id,
      provider: available.at(-1)?.id || null,
      status: "failed",
    };
  }

  async function sendAll(messages, { onProgress } = {}) {
    const { errors, results } = await processWithConcurrency(
      messages,
      async (message) => {
        const result = await send(message);
        onProgress?.(result);
        return result;
      },
      {
        concurrency: config.maxSendConcurrency,
      },
    );

    if (errors[0]?.error?.code === "provider_not_configured") {
      throw errors[0].error;
    }

    const sent = results.filter((result) => result.status === "sent");
    const failed = results.filter((result) => result.status === "failed");
    const ambiguous = results.filter((result) => result.status === "ambiguous");
    const providersUsed = [...new Set(results.map((result) => result.provider).filter(Boolean))];

    return {
      ambiguousCount: ambiguous.length,
      failedCount: failed.length,
      failoverCount: results.reduce((total, result) => total + (result.failoverCount || 0), 0),
      providersUsed,
      requestedCount: messages.length,
      results: results.map((result) => ({
        error: result.error || null,
        failoverCount: result.failoverCount,
        messageId: result.messageId,
        provider: result.provider,
        status: result.status,
      })),
      sentCount: sent.length,
    };
  }

  return {
    send,
    sendAll,
  };
}
