const STORE_KEY = "__pidgeotDevLabUnsubscribeHits";

function getHitList() {
  if (!globalThis[STORE_KEY]) {
    globalThis[STORE_KEY] = [];
  }

  return globalThis[STORE_KEY];
}

export function recordDevLabUnsubscribeHit({ method, token }) {
  const hits = getHitList();

  hits.push({
    at: Date.now(),
    method: method || "GET",
    token: typeof token === "string" ? token.slice(0, 64) : "",
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
  return getHitList().slice(-limit).map((hit) => ({
    at: hit.at,
    method: hit.method,
    tokenPreview: hit.token ? `${hit.token.slice(0, 8)}…` : "",
  }));
}
