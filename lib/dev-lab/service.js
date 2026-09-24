import { assertMailDeliveryReady, getDevLabConfig, getDevLabPublicStatus } from "@/lib/dev-lab/config";
import { DEV_LAB_LIMITS } from "@/lib/dev-lab/constants";
import { createDevLabDataset, normalizeGenerationRequest } from "@/lib/dev-lab/generator";
import { createDevMailAdapter } from "@/lib/dev-mail/adapter";
import {
  completeDevLabGenerationProgress,
  failDevLabGenerationProgress,
  recordDevLabGenerationProgress,
  startDevLabGenerationProgress,
} from "@/lib/dev-lab/generation-progress";
import { getDevLabUnsubscribeHitCount } from "@/lib/dev-lab/unsubscribe-store";

function logGeneration({ ambiguousCount, failedCount, failoverCount, providersUsed, seed, senderCount, sentCount }) {
  console.info("[dev-lab] generation complete", {
    ambiguousCount,
    failedCount,
    failoverCount,
    providersUsed,
    seed,
    senderCount,
    sentCount,
  });
}

function buildResultMessage({ ambiguousCount, failedCount, requestedCount, sentCount }) {
  if (ambiguousCount > 0 && failedCount === 0 && sentCount + ambiguousCount === requestedCount) {
    return `${sentCount} of ${requestedCount} messages confirmed sent. ${ambiguousCount} had an ambiguous delivery outcome and were not retried.`;
  }

  if (failedCount > 0 || ambiguousCount > 0) {
    return `${sentCount} of ${requestedCount} messages confirmed sent. ${failedCount} failed. ${ambiguousCount} were ambiguous. SMTP acceptance does not prove Gmail received them.`;
  }

  return `${sentCount} messages were submitted through the development mail adapter. This does not prove Gmail received them.`;
}

export function createDevLabService({
  adapter,
  config = getDevLabConfig(),
} = {}) {
  const mailAdapter = adapter || createDevMailAdapter({ config });

  return {
    async generatePromotionalMail(input = {}) {
      assertMailDeliveryReady(config);
      const request = normalizeGenerationRequest(input, {
        ...DEV_LAB_LIMITS,
        MAX_TOTAL_MESSAGES: config.maxMessagesPerGeneration,
      });
      const dataset = createDevLabDataset({
        fromDomain: config.fromDomain,
        recipient: config.recipient,
        unsubscribeBaseUrl: config.unsubscribeBaseUrl,
        ...request,
      });
      startDevLabGenerationProgress({ requestedCount: dataset.messages.length });

      let delivery;

      try {
        delivery = await mailAdapter.sendAll(dataset.messages, {
          onProgress: recordDevLabGenerationProgress,
        });
      } catch (error) {
        failDevLabGenerationProgress();
        throw error;
      }

      completeDevLabGenerationProgress(delivery);

      logGeneration({
        ambiguousCount: delivery.ambiguousCount,
        failedCount: delivery.failedCount,
        failoverCount: delivery.failoverCount,
        providersUsed: delivery.providersUsed,
        seed: request.seed,
        senderCount: request.senderCount,
        sentCount: delivery.sentCount,
      });

      const status = delivery.failedCount === 0 && delivery.ambiguousCount === 0
        ? "submitted"
        : delivery.sentCount > 0
          ? "partial"
          : "failed";

      return {
        ambiguousCount: delivery.ambiguousCount,
        categoryProfile: request.categoryProfile,
        failedCount: delivery.failedCount,
        failoverCount: delivery.failoverCount,
        generatedCount: dataset.summary.messageCount,
        intendedUnreadCount: dataset.summary.intendedUnreadCount,
        message: buildResultMessage({
          ambiguousCount: delivery.ambiguousCount,
          failedCount: delivery.failedCount,
          requestedCount: delivery.requestedCount,
          sentCount: delivery.sentCount,
        }),
        messageCount: dataset.summary.messageCount,
        providersUsed: delivery.providersUsed,
        recipientMasked: getDevLabPublicStatus(config).recipientMasked,
        requestedCount: delivery.requestedCount,
        rfc8058Count: dataset.summary.rfc8058Count,
        seed: request.seed,
        senderCount: dataset.summary.senderCount,
        sentCount: delivery.sentCount,
        status,
        unsubscribeEndpointHits: getDevLabUnsubscribeHitCount(),
        unsubscribeProfile: request.unsubscribeProfile,
      };
    },
  };
}
