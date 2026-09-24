import dns from "node:dns/promises";
import { isIP } from "node:net";

import { UNSUBSCRIBE_EXECUTION_SUPPORTED_PORTS } from "@/lib/unsubscribe/constants";

const METADATA_HOSTS = new Set([
  "100.100.100.200",
  "169.254.169.254",
  "metadata.google.internal",
]);

const DISALLOWED_INTERNAL_HOST_SUFFIXES = [
  ".home",
  ".internal",
  ".lan",
  ".local",
  ".localdomain",
];

const IPV4_BLOCKED_CIDRS = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

const IPV6_BLOCKED_CIDRS = [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
];

function normalizeHost(hostname) {
  return String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "").replace(/\.+$/, "");
}

function parseIPv4(address) {
  const octets = String(address).split(".").map((part) => Number.parseInt(part, 10));

  if (octets.length !== 4 || octets.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return null;
  }

  return octets.reduce((value, octet) => ((value << 8) | octet) >>> 0, 0);
}

function expandIPv6(address) {
  const normalized = normalizeHost(address);

  if (!normalized || normalized.includes(":::")) {
    return null;
  }

  const [withoutZone] = normalized.split("%");
  const hasEmbeddedIpv4 = withoutZone.includes(".");
  let workingAddress = withoutZone;

  if (hasEmbeddedIpv4) {
    const lastColonIndex = workingAddress.lastIndexOf(":");

    if (lastColonIndex < 0) {
      return null;
    }

    const embeddedIpv4 = parseIPv4(workingAddress.slice(lastColonIndex + 1));

    if (embeddedIpv4 == null) {
      return null;
    }

    const high = ((embeddedIpv4 >>> 16) & 0xffff).toString(16);
    const low = (embeddedIpv4 & 0xffff).toString(16);
    workingAddress = `${workingAddress.slice(0, lastColonIndex)}:${high}:${low}`;
  }

  const halves = workingAddress.split("::");

  if (halves.length > 2) {
    return null;
  }

  const left = halves[0] ? halves[0].split(":").filter(Boolean) : [];
  const right = halves[1] ? halves[1].split(":").filter(Boolean) : [];

  if (left.length + right.length > 8) {
    return null;
  }

  const fillCount = 8 - (left.length + right.length);
  const parts = halves.length === 2
    ? [...left, ...Array.from({ length: fillCount }, () => "0"), ...right]
    : left;

  if (parts.length !== 8) {
    return null;
  }

  const values = [];

  for (const part of parts) {
    const parsed = Number.parseInt(part, 16);

    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 0xffff) {
      return null;
    }

    values.push(parsed);
  }

  return values;
}

function parseIPv6(address) {
  const parts = expandIPv6(address);

  if (!parts) {
    return null;
  }

  return parts.reduce((value, part) => (value << 16n) + BigInt(part), 0n);
}

function isIPv4InCidr(address, baseAddress, prefixLength) {
  const parsedAddress = parseIPv4(address);
  const parsedBase = parseIPv4(baseAddress);

  if (parsedAddress == null || parsedBase == null) {
    return false;
  }

  const mask = prefixLength === 0 ? 0 : ((0xffffffff << (32 - prefixLength)) >>> 0);
  return (parsedAddress & mask) === (parsedBase & mask);
}

function isIPv6InCidr(address, baseAddress, prefixLength) {
  const parsedAddress = parseIPv6(address);
  const parsedBase = parseIPv6(baseAddress);

  if (parsedAddress == null || parsedBase == null) {
    return false;
  }

  const mask = prefixLength === 0
    ? 0n
    : ((1n << BigInt(prefixLength)) - 1n) << BigInt(128 - prefixLength);

  return (parsedAddress & mask) === (parsedBase & mask);
}

function parseMappedIpv4FromIPv6(address) {
  const parts = expandIPv6(address);

  if (!parts) {
    return null;
  }

  const prefixParts = parts.slice(0, 5);

  if (prefixParts.some((part) => part !== 0) || parts[5] !== 0xffff) {
    return null;
  }

  return `${parts[6] >>> 8}.${parts[6] & 0xff}.${parts[7] >>> 8}.${parts[7] & 0xff}`;
}

export function getUnsafeHostnameReason(hostname) {
  const normalizedHost = normalizeHost(hostname);

  if (!normalizedHost) {
    return "INVALID_HOST";
  }

  if (normalizedHost === "localhost" || normalizedHost.endsWith(".localhost")) {
    return "LOCALHOST_HOST";
  }

  if (DISALLOWED_INTERNAL_HOST_SUFFIXES.some((suffix) => normalizedHost.endsWith(suffix))) {
    return "INTERNAL_HOSTNAME";
  }

  if (METADATA_HOSTS.has(normalizedHost)) {
    return "METADATA_SERVICE_HOST";
  }

  return null;
}

export function getUnsafeIpAddressReason(address) {
  const normalizedAddress = normalizeHost(address);
  const family = isIP(normalizedAddress);

  if (family === 4) {
    return IPV4_BLOCKED_CIDRS.some(([baseAddress, prefixLength]) => isIPv4InCidr(normalizedAddress, baseAddress, prefixLength))
      ? "PRIVATE_OR_RESERVED_IPV4"
      : null;
  }

  if (family === 6) {
    const mappedIpv4 = parseMappedIpv4FromIPv6(normalizedAddress);

    if (mappedIpv4) {
      return getUnsafeIpAddressReason(mappedIpv4) ? "PRIVATE_OR_RESERVED_IPV4_MAPPED_IPV6" : null;
    }

    return IPV6_BLOCKED_CIDRS.some(([baseAddress, prefixLength]) => isIPv6InCidr(normalizedAddress, baseAddress, prefixLength))
      ? "PRIVATE_OR_RESERVED_IPV6"
      : null;
  }

  return "INVALID_IP_ADDRESS";
}

function readHostnameOnly(target) {
  try {
    return normalizeHost(new URL(target).hostname);
  } catch {
    return null;
  }
}

function logUnsubscribeDnsDiagnostic(details) {
  console.info("[pidgeot:unsubscribe-dns]", {
    hostname: details.hostname || null,
    addresses: Array.isArray(details.addresses) ? details.addresses : [],
    dnsFailed: Boolean(details.dnsFailed),
    errorCode: details.errorCode || null,
    finalResult: details.finalResult,
    safeAddressCount: Number.isFinite(details.safeAddressCount) ? details.safeAddressCount : 0,
    selectedAddress: details.selectedAddress || null,
    selectedFamily: details.selectedFamily || null,
    systemCode: details.systemCode || null,
  });
}

export function validateExecutionUrl(target) {
  let url;

  try {
    url = new URL(target);
  } catch {
    const error = new Error("unsubscribe_target_malformed");
    error.code = "unsubscribe_target_malformed";
    throw error;
  }

  if (url.protocol !== "https:") {
    const error = new Error("unsubscribe_target_requires_https");
    error.code = "unsubscribe_target_requires_https";
    throw error;
  }

  if (url.username || url.password) {
    const error = new Error("unsubscribe_target_embedded_credentials");
    error.code = "unsubscribe_target_embedded_credentials";
    throw error;
  }

  if (!UNSUBSCRIBE_EXECUTION_SUPPORTED_PORTS.has(url.port)) {
    const error = new Error("unsubscribe_target_unsupported_port");
    error.code = "unsubscribe_target_unsupported_port";
    throw error;
  }

  const unsafeHostnameReason = getUnsafeHostnameReason(url.hostname);

  if (unsafeHostnameReason) {
    const error = new Error("unsubscribe_target_unsafe_hostname");
    error.code = "unsubscribe_target_unsafe_hostname";
    error.reason = unsafeHostnameReason;
    throw error;
  }

  return {
    hostname: normalizeHost(url.hostname),
    port: url.port || "443",
    url,
  };
}

export async function defaultResolveHostnameAddresses(hostname) {
  return dns.lookup(hostname, {
    all: true,
    order: "verbatim",
  });
}

export async function resolveAndValidateExecutionTarget(target, {
  resolveHostnameAddresses = defaultResolveHostnameAddresses,
} = {}) {
  let parsedTarget;

  try {
    parsedTarget = validateExecutionUrl(target);
  } catch (error) {
    logUnsubscribeDnsDiagnostic({
      dnsFailed: false,
      errorCode: error?.code || "unsubscribe_target_malformed",
      finalResult: "REJECTED",
      hostname: readHostnameOnly(target),
    });
    throw error;
  }

  let resolvedAddresses;

  try {
    resolvedAddresses = await resolveHostnameAddresses(parsedTarget.hostname);
  } catch (error) {
    const wrappedError = new Error("unsubscribe_dns_resolution_failed");
    wrappedError.code = "unsubscribe_dns_resolution_failed";
    wrappedError.cause = error;
    wrappedError.retryable = error?.code === "EAI_AGAIN" || error?.code === "ETIMEDOUT";
    logUnsubscribeDnsDiagnostic({
      dnsFailed: true,
      errorCode: wrappedError.code,
      finalResult: "REJECTED",
      hostname: parsedTarget.hostname,
      systemCode: error?.code || null,
    });
    throw wrappedError;
  }

  if (!Array.isArray(resolvedAddresses) || resolvedAddresses.length === 0) {
    const error = new Error("unsubscribe_dns_resolution_empty");
    error.code = "unsubscribe_dns_resolution_empty";
    logUnsubscribeDnsDiagnostic({
      addresses: [],
      dnsFailed: true,
      errorCode: error.code,
      finalResult: "REJECTED",
      hostname: parsedTarget.hostname,
      safeAddressCount: 0,
    });
    throw error;
  }

  const addressDiagnostics = resolvedAddresses.map((entry) => {
    const address = normalizeHost(entry.address);
    const rejectionReason = getUnsafeIpAddressReason(address);

    return {
      address,
      family: entry.family,
      passed: !rejectionReason,
      rejectionReason: rejectionReason || null,
    };
  });
  const safeAddressCount = addressDiagnostics.filter((entry) => entry.passed).length;
  const rejectedAddress = addressDiagnostics.find((entry) => !entry.passed);

  if (rejectedAddress) {
    const error = new Error("unsubscribe_target_unsafe_ip");
    error.code = "unsubscribe_target_unsafe_ip";
    error.reason = rejectedAddress.rejectionReason;
    logUnsubscribeDnsDiagnostic({
      addresses: addressDiagnostics,
      dnsFailed: false,
      errorCode: error.code,
      finalResult: "REJECTED",
      hostname: parsedTarget.hostname,
      safeAddressCount,
    });
    throw error;
  }

  const normalizedAddresses = addressDiagnostics.map((entry) => ({
    address: entry.address,
    family: entry.family,
  }));
  const selectedAddress = [...normalizedAddresses].sort((left, right) => {
    const leftKey = `${left.family}:${left.address}`;
    const rightKey = `${right.family}:${right.address}`;
    return leftKey.localeCompare(rightKey);
  })[0];

  logUnsubscribeDnsDiagnostic({
    addresses: addressDiagnostics,
    dnsFailed: false,
    errorCode: null,
    finalResult: "ACCEPTED",
    hostname: parsedTarget.hostname,
    safeAddressCount,
    selectedAddress: selectedAddress.address,
    selectedFamily: selectedAddress.family,
  });

  return {
    ...parsedTarget,
    addresses: normalizedAddresses,
    selectedAddress,
  };
}