import { createHash } from "node:crypto";
import { isIP } from "node:net";

import {
  RFC8058_ONE_CLICK_TOKEN,
  UNSUBSCRIBE_OPERATION_STATUSES,
  UNSUBSCRIBE_OPERATION_TYPES,
} from "@/lib/unsubscribe/constants";

const DISALLOWED_PROTOCOLS = new Set(["about:", "blob:", "data:", "file:", "ftp:", "javascript:"]);
const METADATA_HOSTS = new Set([
  "169.254.169.254",
  "100.100.100.200",
  "metadata.google.internal",
]);

function collapseWhitespace(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function hashOperationKey(value) {
  return `uo_${createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
}

function normalizeHost(hostname) {
  return hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.+$/, "");
}

function isLoopbackOrPrivateIPv4(hostname) {
  const octets = hostname.split(".").map((part) => Number.parseInt(part, 10));

  if (octets.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return true;
  }

  const [first, second] = octets;

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
}

function isPrivateOrSpecialIPv6(hostname) {
  const normalized = hostname.toLowerCase();

  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb") ||
    normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:10.") ||
    normalized.startsWith("::ffff:169.254.") ||
    normalized.startsWith("::ffff:172.16.") ||
    normalized.startsWith("::ffff:172.17.") ||
    normalized.startsWith("::ffff:172.18.") ||
    normalized.startsWith("::ffff:172.19.") ||
    normalized.startsWith("::ffff:172.2") ||
    normalized.startsWith("::ffff:192.168.") ||
    normalized.startsWith("::ffff:0.")
  );
}

function getUnsafeHostReason(hostname) {
  if (!hostname) {
    return "INVALID_HOST";
  }

  const normalizedHost = normalizeHost(hostname);

  if (normalizedHost === "localhost" || normalizedHost.endsWith(".localhost")) {
    return "LOCALHOST_HOST";
  }

  if (METADATA_HOSTS.has(normalizedHost)) {
    return "METADATA_SERVICE_HOST";
  }

  const ipVersion = isIP(normalizedHost);

  if (ipVersion === 4 && isLoopbackOrPrivateIPv4(normalizedHost)) {
    return "PRIVATE_OR_LOOPBACK_IPV4";
  }

  if (ipVersion === 6 && isPrivateOrSpecialIPv6(normalizedHost)) {
    return "PRIVATE_OR_LOOPBACK_IPV6";
  }

  return null;
}

function extractListUnsubscribeTargets(headerValue) {
  const normalizedValue = collapseWhitespace(headerValue);

  if (!normalizedValue) {
    return [];
  }

  const angleMatches = Array.from(normalizedValue.matchAll(/<([^>]+)>/g)).map((match) => collapseWhitespace(match[1]));

  if (angleMatches.length > 0) {
    return angleMatches.filter(Boolean);
  }

  return normalizedValue.split(",").map((part) => collapseWhitespace(part)).filter(Boolean);
}

function hasOneClickSemantics(headerValue) {
  return collapseWhitespace(headerValue).toLowerCase().includes(RFC8058_ONE_CLICK_TOKEN);
}

function sanitizeQueryParamMap(searchParams) {
  const keys = [...new Set([...searchParams.keys()])].sort();
  const result = {};

  for (const key of keys) {
    result[key] = searchParams.getAll(key);
  }

  return result;
}

function buildSanitizedSummary(operation) {
  return {
    automatic: operation.status === UNSUBSCRIBE_OPERATION_STATUSES.AUTOMATIC,
    id: operation.id,
    manualActionRequired: operation.status === UNSUBSCRIBE_OPERATION_STATUSES.MANUAL_ACTION_REQUIRED,
    status: operation.status,
    type: operation.type,
  };
}

function createUnavailableSummary() {
  return {
    mechanisms: [],
    resolutionStatus: UNSUBSCRIBE_OPERATION_STATUSES.UNAVAILABLE,
  };
}

function resolveMailtoTarget(target) {
  let url;

  try {
    url = new URL(target);
  } catch {
    return {
      operation: {
        id: hashOperationKey(`unsafe:${target}`),
        reason: "MALFORMED_MAILTO_URL",
        status: UNSUBSCRIBE_OPERATION_STATUSES.UNSAFE,
        type: UNSUBSCRIBE_OPERATION_TYPES.UNSAFE_URL,
      },
      summary: buildSanitizedSummary({
        status: UNSUBSCRIBE_OPERATION_STATUSES.UNSAFE,
        type: UNSUBSCRIBE_OPERATION_TYPES.UNSAFE_URL,
      }),
    };
  }

  const recipient = collapseWhitespace(decodeURIComponent(url.pathname || "")).toLowerCase();

  if (!recipient || !recipient.includes("@")) {
    return {
      operation: {
        id: hashOperationKey(`unsafe:${target}`),
        reason: "INVALID_MAILTO_RECIPIENT",
        status: UNSUBSCRIBE_OPERATION_STATUSES.UNSAFE,
        type: UNSUBSCRIBE_OPERATION_TYPES.UNSAFE_URL,
      },
      summary: buildSanitizedSummary({
        status: UNSUBSCRIBE_OPERATION_STATUSES.UNSAFE,
        type: UNSUBSCRIBE_OPERATION_TYPES.UNSAFE_URL,
      }),
    };
  }

  const operation = {
    id: hashOperationKey(`mailto:${recipient}:${url.searchParams.toString()}`),
    mailto: {
      body: url.searchParams.get("body") || null,
      queryParameters: sanitizeQueryParamMap(url.searchParams),
      recipient,
      subject: url.searchParams.get("subject") || null,
    },
    scheme: "mailto",
    status: UNSUBSCRIBE_OPERATION_STATUSES.MANUAL_ACTION_REQUIRED,
    type: UNSUBSCRIBE_OPERATION_TYPES.MAILTO,
  };

  return {
    operation,
    summary: buildSanitizedSummary(operation),
  };
}

function resolveWebTarget(target, listUnsubscribePost) {
  let url;

  try {
    url = new URL(target);
  } catch {
    const operation = {
      id: hashOperationKey(`unsafe:${target}`),
      reason: "MALFORMED_URL",
      status: UNSUBSCRIBE_OPERATION_STATUSES.UNSAFE,
      type: UNSUBSCRIBE_OPERATION_TYPES.UNSAFE_URL,
    };

    return { operation, summary: buildSanitizedSummary(operation) };
  }

  const protocol = url.protocol.toLowerCase();

  if (DISALLOWED_PROTOCOLS.has(protocol)) {
    const operation = {
      id: hashOperationKey(`unsafe:${target}`),
      reason: "UNSAFE_SCHEME",
      status: UNSUBSCRIBE_OPERATION_STATUSES.UNSAFE,
      type: UNSUBSCRIBE_OPERATION_TYPES.UNSAFE_URL,
    };

    return { operation, summary: buildSanitizedSummary(operation) };
  }

  if (protocol !== "http:" && protocol !== "https:") {
    const operation = {
      id: hashOperationKey(`unsafe:${target}`),
      reason: "UNSUPPORTED_SCHEME",
      status: UNSUBSCRIBE_OPERATION_STATUSES.UNSAFE,
      type: UNSUBSCRIBE_OPERATION_TYPES.UNSAFE_URL,
    };

    return { operation, summary: buildSanitizedSummary(operation) };
  }

  if (url.username || url.password) {
    const operation = {
      id: hashOperationKey(`unsafe:${target}`),
      reason: "EMBEDDED_CREDENTIALS",
      status: UNSUBSCRIBE_OPERATION_STATUSES.UNSAFE,
      type: UNSUBSCRIBE_OPERATION_TYPES.UNSAFE_URL,
    };

    return { operation, summary: buildSanitizedSummary(operation) };
  }

  const unsafeHostReason = getUnsafeHostReason(url.hostname);

  if (unsafeHostReason) {
    const operation = {
      id: hashOperationKey(`unsafe:${target}`),
      reason: unsafeHostReason,
      status: UNSUBSCRIBE_OPERATION_STATUSES.UNSAFE,
      type: UNSUBSCRIBE_OPERATION_TYPES.UNSAFE_URL,
    };

    return { operation, summary: buildSanitizedSummary(operation) };
  }

  const normalizedTarget = url.toString();
  const oneClick = protocol === "https:" && hasOneClickSemantics(listUnsubscribePost);
  const operation = {
    host: normalizeHost(url.hostname),
    id: hashOperationKey(`${protocol}:${normalizedTarget}:${collapseWhitespace(listUnsubscribePost).toLowerCase()}`),
    path: url.pathname || "/",
    port: url.port || null,
    scheme: protocol.slice(0, -1),
    status: oneClick
      ? UNSUBSCRIBE_OPERATION_STATUSES.AUTOMATIC
      : UNSUBSCRIBE_OPERATION_STATUSES.MANUAL_ACTION_REQUIRED,
    target: normalizedTarget,
    type: oneClick
      ? UNSUBSCRIBE_OPERATION_TYPES.RFC8058_ONE_CLICK
      : protocol === "https:"
        ? UNSUBSCRIBE_OPERATION_TYPES.HTTPS_LINK
        : UNSUBSCRIBE_OPERATION_TYPES.HTTP_LINK,
  };

  return { operation, summary: buildSanitizedSummary(operation) };
}

export function resolveUnsubscribeMechanisms({ observations = [] } = {}) {
  if (!Array.isArray(observations) || observations.length === 0) {
    return {
      operations: [],
      summary: createUnavailableSummary(),
    };
  }

  const operationsById = new Map();
  for (const observation of observations) {
    const targets = extractListUnsubscribeTargets(observation?.listUnsubscribe);
    const listUnsubscribePost = observation?.listUnsubscribePost || "";

    for (const target of targets) {
      const normalizedTarget = collapseWhitespace(target);

      if (!normalizedTarget) {
        continue;
      }

      const resolved = normalizedTarget.toLowerCase().startsWith("mailto:")
        ? resolveMailtoTarget(normalizedTarget)
        : resolveWebTarget(normalizedTarget, listUnsubscribePost);

      operationsById.set(resolved.operation.id, resolved.operation);
    }
  }

  const operations = [...operationsById.values()].sort((left, right) => left.id.localeCompare(right.id));
  const mechanisms = operations.map(buildSanitizedSummary).sort((left, right) => {
    const leftKey = `${left.type}:${left.status}:${left.id}`;
    const rightKey = `${right.type}:${right.status}:${right.id}`;
    return leftKey.localeCompare(rightKey);
  });

  const resolutionStatus = operations.some((operation) => operation.status === UNSUBSCRIBE_OPERATION_STATUSES.AUTOMATIC)
    ? UNSUBSCRIBE_OPERATION_STATUSES.AUTOMATIC
    : operations.some((operation) => operation.status === UNSUBSCRIBE_OPERATION_STATUSES.MANUAL_ACTION_REQUIRED)
      ? UNSUBSCRIBE_OPERATION_STATUSES.MANUAL_ACTION_REQUIRED
      : operations.some((operation) => operation.status === UNSUBSCRIBE_OPERATION_STATUSES.UNSAFE)
        ? UNSUBSCRIBE_OPERATION_STATUSES.UNSAFE
        : UNSUBSCRIBE_OPERATION_STATUSES.UNAVAILABLE;

  return {
    operations,
    summary: {
      mechanisms,
      resolutionStatus,
    },
  };
}