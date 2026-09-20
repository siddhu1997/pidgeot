import { ensureSessionHasUsableGmailAccessToken } from "@/lib/auth/gmail-session";
import { getActiveSessionStore } from "@/lib/auth/active-session-store";
import { mapGmailError, GmailAppError } from "@/lib/gmail/error-map";
import { createGmailQuotaPolicy } from "@/lib/gmail/quota-policy";
import { createGmailRetryPolicy } from "@/lib/gmail/retry-policy";
import { getProcessingLeaseStore } from "@/lib/sessions/processing-lease-store";
import { getServerAppConfig } from "@/lib/config";
import { createGoogleOAuthClient } from "@/lib/auth/google";

const GMAIL_API_BASE_URL = "https://gmail.googleapis.com/gmail/v1/users/me";

function createRequestUrl(pathname, searchParams = new URLSearchParams()) {
  const query = searchParams.toString();
  return `${GMAIL_API_BASE_URL}${pathname}${query ? `?${query}` : ""}`;
}

function createHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

function assertProcessingOwnership(processingLeaseStore, { leaseId, sessionId }) {
  if (!processingLeaseStore.canProcess({ leaseId, sessionId })) {
    throw new GmailAppError({
      category: "AUTHENTICATION_REQUIRED",
      message: "A valid processing lease is required before Gmail work can continue.",
    });
  }
}

export function createGmailClient({
  config = getServerAppConfig(),
  fetchImpl = fetch,
  oauthClientFactory = createGoogleOAuthClient,
  processingLeaseStore = getProcessingLeaseStore(config),
  quotaPolicy = createGmailQuotaPolicy(),
  retryPolicy = createGmailRetryPolicy(),
  sessionStore = getActiveSessionStore(config),
} = {}) {
  async function performJsonRequest({ leaseId, methodName, operationMode = "idempotent", pathname, requestInit = {}, searchParams, sessionId }) {
    assertProcessingOwnership(processingLeaseStore, { leaseId, sessionId });

    const quotaDecision = quotaPolicy.recordConsumption({ methodName, userId: sessionId });

    if (!quotaDecision.allowed) {
      throw new GmailAppError({
        category: "QUOTA_EXHAUSTED",
        message: "The local Gmail application budget does not allow another request right now.",
      });
    }

    return retryPolicy.execute(async () => {
      try {
        const { accessToken } = await ensureSessionHasUsableGmailAccessToken({
          config,
          oauthClientFactory,
          sessionId,
          sessionStore,
        });
        const response = await fetchImpl(createRequestUrl(pathname, searchParams), {
          ...requestInit,
          headers: {
            ...requestInit.headers,
            ...createHeaders(accessToken),
          },
        });

        if (!response.ok) {
          const errorPayload = await response.json().catch(() => null);
          throw {
            response: {
              data: errorPayload,
              headers: {
                get: (headerName) => response.headers.get(headerName),
              },
              status: response.status,
            },
            status: response.status,
          };
        }

        return response.json();
      } catch (error) {
        throw mapGmailError(error);
      }
    }, { operationMode });
  }

  return {
    async getMessageMetadata({ headers = [], leaseId, messageId, sessionId }) {
      const searchParams = new URLSearchParams({ format: "metadata" });

      for (const headerName of headers) {
        searchParams.append("metadataHeaders", headerName);
      }

      return performJsonRequest({
        leaseId,
        methodName: "messages.get",
        pathname: `/messages/${messageId}`,
        searchParams,
        sessionId,
      });
    },
    async listMessagePage({ leaseId, maxResults = 50, pageToken = "", query = "", sessionId }) {
      const searchParams = new URLSearchParams({
        maxResults: String(maxResults),
      });

      if (pageToken) {
        searchParams.set("pageToken", pageToken);
      }

      if (query) {
        searchParams.set("q", query);
      }

      return performJsonRequest({
        leaseId,
        methodName: "messages.list",
        pathname: "/messages",
        searchParams,
        sessionId,
      });
    },
    async trashMessage({ leaseId, messageId, sessionId }) {
      return performJsonRequest({
        leaseId,
        methodName: "messages.trash",
        pathname: `/messages/${messageId}/trash`,
        requestInit: {
          method: "POST",
        },
        sessionId,
      });
    },
  };
}