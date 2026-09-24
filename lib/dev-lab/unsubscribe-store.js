import {
  DEV_LAB_SENDER_CATALOG,
  DEV_LAB_UNSUBSCRIBE_PROFILES,
  DEV_LAB_UNSUBSCRIBE_TOKEN_PATTERN,
} from "@/lib/dev-lab/constants";

const STORE_KEY = "__pidgeotDevLabUnsubscribeHits";

const KNOWN_UNSUBSCRIBE_PROFILES = [...new Set(Object.values(DEV_LAB_UNSUBSCRIBE_PROFILES))]
  .map((profile) => profile.toLowerCase())
  .sort((left, right) => right.length - left.length);

function getHitList() {
  if (!globalThis[STORE_KEY]) {
    globalThis[STORE_KEY] = [];
  }

  return globalThis[STORE_KEY];
}

function parseDevLabUnsubscribeToken(token) {
  if (!DEV_LAB_UNSUBSCRIBE_TOKEN_PATTERN.test(token)) {
    return null;
  }

  const remainder = token.slice(3);
  const seedSeparator = remainder.indexOf("_");

  if (seedSeparator <= 0 || !/^\d+$/.test(remainder.slice(0, seedSeparator))) {
    return null;
  }

  const identityAndProfile = remainder.slice(seedSeparator + 1);
  const profile = KNOWN_UNSUBSCRIBE_PROFILES.find((candidate) => (
    identityAndProfile === candidate || identityAndProfile.endsWith(`_${candidate}`)
  ));

  if (!profile) {
    return null;
  }

  const slug = identityAndProfile === profile
    ? ""
    : identityAndProfile.slice(0, identityAndProfile.length - profile.length - 1);
  const sender = DEV_LAB_SENDER_CATALOG.find((entry) => entry.slug === slug);

  return {
    requestType: profile.toUpperCase(),
    senderName: sender?.displayName || null,
  };
}

export function recordDevLabUnsubscribeHit({ method, token }) {
  const hits = getHitList();
  const parsed = parseDevLabUnsubscribeToken(token);

  hits.push({
    at: Date.now(),
    method: method || "GET",
    requestType: parsed?.requestType || null,
    senderName: parsed?.senderName || null,
    status: "received",
  });

  if (hits.length > 200) {
    hits.splice(0, hits.length - 200);
  }

  return hits.length;
}

export function getDevLabUnsubscribeHitCount() {
  return getHitList().length;
}

export function getRecentDevLabUnsubscribeHits(limit = 10) {
  return getHitList().slice(-limit).reverse().map((hit) => ({
    at: hit.at,
    requestType: hit.requestType,
    senderName: hit.senderName,
    status: hit.status || "received",
  }));
}
