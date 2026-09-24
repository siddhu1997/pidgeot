export const DEV_MAIL_ERROR_KINDS = {
  AMBIGUOUS: "ambiguous",
  PERMANENT: "permanent",
  TRANSIENT: "transient",
};

const TRANSIENT_CODES = new Set([
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "ECONNECTION",
  "ENETUNREACH",
  "EPIPE",
  "ESOCKET",
  "ETIMEDOUT",
]);

const AUTH_CODES = new Set(["EAUTH", "EENVELOPE"]);
const AUTH_RESPONSE_CODES = new Set([432, 454, 530, 534, 535, 538]);
const TRANSIENT_RESPONSE_CODES = new Set([421, 432, 441, 442, 450, 451, 452, 453]);

function createDevMailError(code, message, extra = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, extra);
  return error;
}

function collapseText(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function getResponseCode(error) {
  const direct = Number(error?.responseCode);
  if (Number.isFinite(direct)) {
    return direct;
  }

  const match = collapseText(error?.response || error?.message).match(/\b([45]\d\d)\b/);
  return match ? Number(match[1]) : null;
}

function mentions(error, pattern) {
  return pattern.test(collapseText(`${error?.code || ""} ${error?.message || ""} ${error?.response || ""}`));
}

export function classifyProviderError(error) {
  const code = String(error?.code || "");
  const responseCode = getResponseCode(error);
  const command = String(error?.command || "").toUpperCase();

  if (code === "EAUTH" || AUTH_RESPONSE_CODES.has(responseCode) || mentions(error, /\b(auth|authentication|login|credentials)\b/i)) {
    return {
      kind: DEV_MAIL_ERROR_KINDS.PERMANENT,
      reason: "authentication_failed",
    };
  }

  if (mentions(error, /\b(unverified|not verified|sender rejected|invalid sender|relay access denied)\b/i)) {
    return {
      kind: DEV_MAIL_ERROR_KINDS.PERMANENT,
      reason: "invalid_sender",
    };
  }

  if (mentions(error, /\b(invalid recipient|unknown user|user unknown|mailbox unavailable|no such user)\b/i)) {
    return {
      kind: DEV_MAIL_ERROR_KINDS.PERMANENT,
      reason: "invalid_recipient",
    };
  }

  if (code === "EMESSAGE" || mentions(error, /\b(malformed|invalid message|message rejected)\b/i)) {
    return {
      kind: DEV_MAIL_ERROR_KINDS.PERMANENT,
      reason: "malformed_message",
    };
  }

  const timedOut = TRANSIENT_CODES.has(code) || mentions(error, /\btimeout|timed out\b/i);
  const afterData = command === "DATA" || command === "DATA END" || command === "BDAT";

  if (timedOut && afterData) {
    return {
      kind: DEV_MAIL_ERROR_KINDS.AMBIGUOUS,
      reason: "delivery_unconfirmed",
    };
  }

  if (timedOut || TRANSIENT_CODES.has(code) || TRANSIENT_RESPONSE_CODES.has(responseCode) || mentions(error, /\b(rate limit|throttl|try again|temporary|temporar)\b/i)) {
    return {
      kind: DEV_MAIL_ERROR_KINDS.TRANSIENT,
      reason: responseCode === 421 || mentions(error, /\brate limit|throttl\b/i)
        ? "provider_throttled"
        : "temporary_provider_failure",
    };
  }

  if (Number.isFinite(responseCode) && responseCode >= 500) {
    return {
      kind: DEV_MAIL_ERROR_KINDS.PERMANENT,
      reason: "permanent_provider_failure",
    };
  }

  if (AUTH_CODES.has(code)) {
    return {
      kind: DEV_MAIL_ERROR_KINDS.PERMANENT,
      reason: "authentication_failed",
    };
  }

  return {
    kind: DEV_MAIL_ERROR_KINDS.PERMANENT,
    reason: "permanent_provider_failure",
  };
}

export function createProviderError({ code, message, provider, reason, kind }) {
  return createDevMailError(code, message, {
    kind,
    provider,
    reason,
  });
}

export function sanitizeProviderFailure({ classification, provider }) {
  const reason = classification?.reason || "permanent_provider_failure";
  const providerLabel = provider || "provider";

  if (reason === "authentication_failed") {
    return createProviderError({
      code: "provider_authentication_failed",
      kind: DEV_MAIL_ERROR_KINDS.PERMANENT,
      message: `${providerLabel} rejected the development SMTP credentials.`,
      provider: providerLabel,
      reason,
    });
  }

  if (reason === "invalid_sender") {
    return createProviderError({
      code: "provider_permanent_failure",
      kind: DEV_MAIL_ERROR_KINDS.PERMANENT,
      message: `${providerLabel} rejected the generated sender. Check the authenticated development domain.`,
      provider: providerLabel,
      reason,
    });
  }

  if (reason === "invalid_recipient") {
    return createProviderError({
      code: "provider_permanent_failure",
      kind: DEV_MAIL_ERROR_KINDS.PERMANENT,
      message: `${providerLabel} rejected the configured development recipient.`,
      provider: providerLabel,
      reason,
    });
  }

  if (reason === "delivery_unconfirmed") {
    return createProviderError({
      code: "delivery_ambiguous",
      kind: DEV_MAIL_ERROR_KINDS.AMBIGUOUS,
      message: `${providerLabel} timed out after the message may already have been accepted. The lab will not send a duplicate.`,
      provider: providerLabel,
      reason,
    });
  }

  if (classification?.kind === DEV_MAIL_ERROR_KINDS.TRANSIENT) {
    return createProviderError({
      code: "provider_transient_failure",
      kind: DEV_MAIL_ERROR_KINDS.TRANSIENT,
      message: `${providerLabel} reported a temporary delivery failure.`,
      provider: providerLabel,
      reason,
    });
  }

  return createProviderError({
    code: "provider_permanent_failure",
    kind: DEV_MAIL_ERROR_KINDS.PERMANENT,
    message: `${providerLabel} could not deliver this development message.`,
    provider: providerLabel,
    reason,
  });
}
