const FALLBACK_APP_BASE_URL = "http://localhost:3000";
const FALLBACK_GITHUB_URL = "https://github.com/example/pidgeot";
export const SESSION_TTL_MS_PER_HOUR = 60 * 60 * 1000;
export const DEFAULT_SESSION_TTL_HOURS = 24;
export const DEFAULT_PROCESSING_LEASE_TTL_SECONDS = 120;

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

export function getPublicAppConfig() {
  return {
    appBaseUrl: normalizeUrl(process.env.APP_BASE_URL, FALLBACK_APP_BASE_URL),
    githubUrl: normalizeUrl(process.env.GITHUB_URL, FALLBACK_GITHUB_URL),
  };
}

export function getServerAppConfig() {
  return {
    appBaseUrl: normalizeUrl(process.env.APP_BASE_URL, FALLBACK_APP_BASE_URL),
    githubUrl: normalizeUrl(process.env.GITHUB_URL, FALLBACK_GITHUB_URL),
    sessionSecret: process.env.SESSION_SECRET || "",
    sessionTtlHours: parsePositiveInt(process.env.SESSION_TTL_HOURS, DEFAULT_SESSION_TTL_HOURS),
    processingLeaseTtlSeconds: parsePositiveInt(
      process.env.PROCESSING_LEASE_TTL_SECONDS,
      DEFAULT_PROCESSING_LEASE_TTL_SECONDS,
    ),
    googleClientId: process.env.GOOGLE_CLIENT_ID || "",
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    googleRedirectUri: normalizeOptionalUrl(process.env.GOOGLE_REDIRECT_URI),
    isProduction: process.env.NODE_ENV === "production",
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