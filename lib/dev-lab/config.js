import { DEFAULT_SCAN_MAX_RETAINED_MESSAGES, DEFAULT_SCAN_PAGE_SIZE, getServerAppConfig } from "@/lib/config";
import {
  DEFAULT_DEV_MAIL_FROM_DOMAIN,
  DEFAULT_DEV_MAIL_UNSUBSCRIBE_BASE_URL,
  DEV_LAB_LIMITS,
  DEV_LAB_UNSUBSCRIBE_PATH,
} from "@/lib/dev-lab/constants";

function parseBooleanFlag(value, fallbackValue) {
  if (value == null || value === "") {
    return fallbackValue;
  }

  const normalizedValue = String(value).trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(normalizedValue)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalizedValue)) {
    return false;
  }

  return fallbackValue;
}

function parsePositiveInt(value, fallbackValue) {
  const parsedValue = Number.parseInt(value || "", 10);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return fallbackValue;
  }

  return parsedValue;
}

function normalizePublicUrl(value, fallbackValue) {
  try {
    return new URL(value || fallbackValue).toString().replace(/\/$/, "");
  } catch {
    return fallbackValue;
  }
}

function createDevLabError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function maskRecipient(value) {
  const normalized = String(value || "").trim();
  const atIndex = normalized.indexOf("@");

  if (atIndex <= 0) {
    return "configured test inbox";
  }

  const local = normalized.slice(0, atIndex);
  const domain = normalized.slice(atIndex + 1);
  const visible = local.slice(0, 1);

  return `${visible}***@${domain}`;
}

function readSmtpProvider(prefix, fallbackHost, fallbackPort) {
  const port = parsePositiveInt(process.env[`${prefix}_SMTP_PORT`], fallbackPort);

  return {
    host: String(process.env[`${prefix}_SMTP_HOST`] || fallbackHost).trim(),
    password: process.env[`${prefix}_SMTP_PASSWORD`] || "",
    port,
    secure: parseBooleanFlag(process.env[`${prefix}_SMTP_SECURE`], port === 465),
    user: String(process.env[`${prefix}_SMTP_USER`] || "").trim(),
  };
}

function isProviderConfigured(provider) {
  return Boolean(provider.host && provider.user && provider.password);
}

export function getDevLabConfig() {
  const app = getServerAppConfig();
  const brevo = readSmtpProvider("DEV_MAIL_BREVO", "smtp-relay.brevo.com", 587);
  const mailgun = readSmtpProvider("DEV_MAIL_MAILGUN", "smtp.eu.mailgun.org", 587);
  const maxMessagesPerGeneration = Math.min(
    parsePositiveInt(process.env.DEV_MAIL_MAX_MESSAGES_PER_GENERATION, DEV_LAB_LIMITS.MAX_TOTAL_MESSAGES),
    DEV_LAB_LIMITS.MAX_TOTAL_MESSAGES,
  );

  return {
    appBaseUrl: app.appBaseUrl,
    brevoHost: brevo.host,
    brevoPassword: brevo.password,
    brevoPort: brevo.port,
    brevoSecure: brevo.secure,
    brevoUser: brevo.user,
    developmentCeiling: app.devScanMessageLimit,
    fromDomain: process.env.DEV_MAIL_FROM_DOMAIN || DEFAULT_DEV_MAIL_FROM_DOMAIN,
    isProduction: app.isProduction,
    mailEnabled: app.isProduction ? false : parseBooleanFlag(process.env.DEV_MAIL_ENABLED, false),
    mailgunHost: mailgun.host,
    mailgunPassword: mailgun.password,
    mailgunPort: mailgun.port,
    mailgunSecure: mailgun.secure,
    mailgunUser: mailgun.user,
    maxMessagesPerGeneration,
    maxSendAttempts: parsePositiveInt(process.env.DEV_MAIL_MAX_SEND_ATTEMPTS, DEV_LAB_LIMITS.MAX_SEND_ATTEMPTS),
    maxSendConcurrency: parsePositiveInt(process.env.DEV_MAIL_MAX_SEND_CONCURRENCY, DEV_LAB_LIMITS.MAX_SEND_CONCURRENCY),
    pageSize: app.scanPageSize || DEFAULT_SCAN_PAGE_SIZE,
    productionCeiling: app.scanMaxRetainedMessages || DEFAULT_SCAN_MAX_RETAINED_MESSAGES,
    recipient: app.isProduction ? "" : String(process.env.DEV_MAIL_RECIPIENT || "").trim(),
    unsubscribeBaseUrl: normalizePublicUrl(
      process.env.DEV_MAIL_UNSUBSCRIBE_BASE_URL,
      DEFAULT_DEV_MAIL_UNSUBSCRIBE_BASE_URL,
    ),
    unsubscribeMode: app.devWorkflowSimulationEnabled ? "simulation" : "real",
    deleteUnreadMode: app.devWorkflowSimulationEnabled ? "simulation" : "real",
  };
}

export function assertDevelopmentLabAvailable(config = getDevLabConfig()) {
  if (config.isProduction) {
    throw createDevLabError(
      "development_only",
      "The Development Lab is available only in development mode.",
    );
  }
}

export function getConfiguredDevMailProviders(config = getDevLabConfig()) {
  return {
    brevo: isProviderConfigured({
      host: config.brevoHost,
      password: config.brevoPassword,
      user: config.brevoUser,
    }),
    mailgun: isProviderConfigured({
      host: config.mailgunHost,
      password: config.mailgunPassword,
      user: config.mailgunUser,
    }),
  };
}

export function assertMailDeliveryReady(config = getDevLabConfig()) {
  assertDevelopmentLabAvailable(config);

  if (!config.mailEnabled) {
    throw createDevLabError(
      "mail_generation_disabled",
      "Development mail delivery is disabled. Set DEV_MAIL_ENABLED=true in the server environment.",
    );
  }

  if (!config.recipient) {
    throw createDevLabError(
      "smtp_not_configured",
      "DEV_MAIL_RECIPIENT is missing. The generator will not accept a browser-supplied address.",
    );
  }

  const providers = getConfiguredDevMailProviders(config);

  if (!providers.brevo && !providers.mailgun) {
    throw createDevLabError(
      "provider_not_configured",
      "Configure Brevo or Mailgun SMTP credentials in the server environment.",
    );
  }

  if (new URL(config.unsubscribeBaseUrl).hostname === "localhost" || config.unsubscribeBaseUrl.includes("127.0.0.1")) {
    throw createDevLabError(
      "invalid_generation_request",
      "DEV_MAIL_UNSUBSCRIBE_BASE_URL must be a public HTTPS development origin, not localhost.",
    );
  }
}

export function getDevLabPublicStatus(config = getDevLabConfig()) {
  const providers = getConfiguredDevMailProviders(config);
  const anyProvider = providers.brevo || providers.mailgun;

  return {
    deleteUnreadMode: config.deleteUnreadMode,
    development: !config.isProduction,
    fromDomain: config.fromDomain,
    limits: {
      maxMessagesPerGeneration: config.maxMessagesPerGeneration,
      maxSendAttempts: config.maxSendAttempts,
      maxSendConcurrency: config.maxSendConcurrency,
    },
    mailDeliveryEnabled: Boolean(config.mailEnabled && anyProvider && config.recipient),
    mailEnabled: config.mailEnabled,
    providers: {
      brevo: { configured: providers.brevo },
      mailgun: { configured: providers.mailgun },
    },
    recipientMasked: config.recipient ? maskRecipient(config.recipient) : null,
    scan: {
      developmentCeiling: config.developmentCeiling,
      pageSize: config.pageSize,
      productionCeiling: config.productionCeiling,
    },
    unsubscribeBaseHost: new URL(config.unsubscribeBaseUrl).host,
    unsubscribeEndpoint: DEV_LAB_UNSUBSCRIBE_PATH,
    unsubscribeMode: config.unsubscribeMode,
  };
}
