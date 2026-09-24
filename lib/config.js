import { getWorkflowExecutionModeOverride } from "@/lib/workflow/execution-mode-store";

const FALLBACK_APP_BASE_URL = "http://localhost:3000";
const FALLBACK_GITHUB_URL = "https://github.com/example/pidgeot";
export const SESSION_TTL_MS_PER_HOUR = 60 * 60 * 1000;
export const DEFAULT_SESSION_TTL_HOURS = 24;
export const DEFAULT_PROCESSING_LEASE_TTL_SECONDS = 120;
export const DEFAULT_SCAN_PAGE_SIZE = 50;
export const DEFAULT_DEV_SCAN_MESSAGE_LIMIT = 50;
export const DEFAULT_SCAN_METADATA_CONCURRENCY = 5;
export const DEFAULT_SCAN_MAX_RETAINED_MESSAGES = 5_000;
export const DEFAULT_CLEANUP_MUTATION_CONCURRENCY = 3;
export const DEFAULT_UNSUBSCRIBE_EXECUTION_CONCURRENCY = 2;
export const DEFAULT_AUTOMATIC_UNSUBSCRIBE_MONTHLY_LIMIT = 5_000;
export const DEFAULT_UNSUBSCRIBE_MAX_REDIRECTS = 2;
export const DEFAULT_UNSUBSCRIBE_MAX_RESPONSE_BYTES = 16 * 1024;
export const DEFAULT_UNSUBSCRIBE_REQUEST_TIMEOUT_MS = 5_000;
export const DEFAULT_UNSUBSCRIBE_RETRY_BASE_DELAY_MS = 250;
export const DEFAULT_UNSUBSCRIBE_RETRY_JITTER_MS = 100;
export const DEFAULT_UNSUBSCRIBE_RETRY_MAX_ATTEMPTS = 2;
export const DEFAULT_UNSUBSCRIBE_RETRY_MAX_DELAY_MS = 2_000;

function normalizeUrl(value, fallbackValue) {
  try {
    return new URL(value || fallbackValue).toString().replace(/\/$/, "");
  } catch {
    return fallbackValue;
  }
}

function normalizeOptionalUrl(value) {
  if (!value) {
    return "";
  }

  try {
    return new URL(value).toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function parsePositiveInt(value, fallbackValue) {
  const parsedValue = Number.parseInt(value || "", 10);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return fallbackValue;
  }

  return parsedValue;
}

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

function resolveWorkflowSimulationEnabled(isProduction) {
  const envSimulationEnabled = parseBooleanFlag(process.env.DEV_SIMULATE_WORKFLOW_EXECUTION, true);

  if (isProduction) {
    return envSimulationEnabled;
  }

  const override = getWorkflowExecutionModeOverride();

  if (override === "real") {
    return false;
  }

  if (override === "simulation") {
    return true;
  }

  return envSimulationEnabled;
}

export function getPublicAppConfig() {
  return {
    appBaseUrl: normalizeUrl(process.env.APP_BASE_URL, FALLBACK_APP_BASE_URL),
    githubUrl: normalizeUrl(process.env.GITHUB_URL, FALLBACK_GITHUB_URL),
  };
}

export function getServerAppConfig() {
  const isProduction = process.env.NODE_ENV === "production";
  const devWorkflowSimulationEnabled = resolveWorkflowSimulationEnabled(isProduction);

  return {
    appBaseUrl: normalizeUrl(process.env.APP_BASE_URL, FALLBACK_APP_BASE_URL),
    githubUrl: normalizeUrl(process.env.GITHUB_URL, FALLBACK_GITHUB_URL),
    devScanMessageLimit: isProduction
      ? null
      : parsePositiveInt(
        process.env.DEV_SCAN_MESSAGE_LIMIT,
        DEFAULT_DEV_SCAN_MESSAGE_LIMIT,
      ),
    sessionSecret: process.env.SESSION_SECRET || "",
    sessionTtlHours: parsePositiveInt(process.env.SESSION_TTL_HOURS, DEFAULT_SESSION_TTL_HOURS),
    processingLeaseTtlSeconds: parsePositiveInt(
      process.env.PROCESSING_LEASE_TTL_SECONDS,
      DEFAULT_PROCESSING_LEASE_TTL_SECONDS,
    ),
    scanPageSize: parsePositiveInt(
      process.env.SCAN_PAGE_SIZE,
      DEFAULT_SCAN_PAGE_SIZE,
    ),
    scanMetadataConcurrency: parsePositiveInt(
      process.env.SCAN_METADATA_CONCURRENCY,
      DEFAULT_SCAN_METADATA_CONCURRENCY,
    ),
    scanMaxRetainedMessages: parsePositiveInt(
      process.env.SCAN_MAX_RETAINED_MESSAGES,
      DEFAULT_SCAN_MAX_RETAINED_MESSAGES,
    ),
    cleanupMutationConcurrency: parsePositiveInt(
      process.env.CLEANUP_MUTATION_CONCURRENCY,
      DEFAULT_CLEANUP_MUTATION_CONCURRENCY,
    ),
    unsubscribeExecutionConcurrency: parsePositiveInt(
      process.env.UNSUBSCRIBE_EXECUTION_CONCURRENCY,
      DEFAULT_UNSUBSCRIBE_EXECUTION_CONCURRENCY,
    ),
    automaticUnsubscribeMonthlyLimit: parsePositiveInt(
      process.env.AUTOMATIC_UNSUBSCRIBE_MONTHLY_LIMIT,
      DEFAULT_AUTOMATIC_UNSUBSCRIBE_MONTHLY_LIMIT,
    ),
    unsubscribeMaxRedirects: parsePositiveInt(
      process.env.UNSUBSCRIBE_MAX_REDIRECTS,
      DEFAULT_UNSUBSCRIBE_MAX_REDIRECTS,
    ),
    unsubscribeMaxResponseBytes: parsePositiveInt(
      process.env.UNSUBSCRIBE_MAX_RESPONSE_BYTES,
      DEFAULT_UNSUBSCRIBE_MAX_RESPONSE_BYTES,
    ),
    unsubscribeRequestTimeoutMs: parsePositiveInt(
      process.env.UNSUBSCRIBE_REQUEST_TIMEOUT_MS,
      DEFAULT_UNSUBSCRIBE_REQUEST_TIMEOUT_MS,
    ),
    unsubscribeRetryBaseDelayMs: parsePositiveInt(
      process.env.UNSUBSCRIBE_RETRY_BASE_DELAY_MS,
      DEFAULT_UNSUBSCRIBE_RETRY_BASE_DELAY_MS,
    ),
    unsubscribeRetryJitterMs: parsePositiveInt(
      process.env.UNSUBSCRIBE_RETRY_JITTER_MS,
      DEFAULT_UNSUBSCRIBE_RETRY_JITTER_MS,
    ),
    unsubscribeRetryMaxAttempts: parsePositiveInt(
      process.env.UNSUBSCRIBE_RETRY_MAX_ATTEMPTS,
      DEFAULT_UNSUBSCRIBE_RETRY_MAX_ATTEMPTS,
    ),
    unsubscribeRetryMaxDelayMs: parsePositiveInt(
      process.env.UNSUBSCRIBE_RETRY_MAX_DELAY_MS,
      DEFAULT_UNSUBSCRIBE_RETRY_MAX_DELAY_MS,
    ),
    googleClientId: process.env.GOOGLE_CLIENT_ID || "",
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    googleRedirectUri: normalizeOptionalUrl(process.env.GOOGLE_REDIRECT_URI),
    devWorkflowSimulationEnabled,
    isProduction,
  };
}

export function isAuthConfigured(config = getServerAppConfig()) {
  return Boolean(
    config.sessionSecret &&
      config.googleClientId &&
      config.googleClientSecret &&
      config.googleRedirectUri,
  );
}