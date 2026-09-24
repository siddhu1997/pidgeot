const STORE_KEY = "__pidgeotDevLabGenerationProgress";

function getStore() {
  if (!globalThis[STORE_KEY]) {
    globalThis[STORE_KEY] = null;
  }

  return globalThis[STORE_KEY];
}

function setStore(next) {
  globalThis[STORE_KEY] = next;
  return next;
}

function sanitize(progress) {
  if (!progress) {
    return null;
  }

  return {
    ambiguousCount: progress.ambiguousCount || 0,
    failedCount: progress.failedCount || 0,
    phase: progress.phase,
    processedCount: progress.processedCount || 0,
    requestedCount: progress.requestedCount || 0,
    sentCount: progress.sentCount || 0,
  };
}

export function startDevLabGenerationProgress({ requestedCount }) {
  return setStore({
    ambiguousCount: 0,
    failedCount: 0,
    phase: "starting",
    processedCount: 0,
    requestedCount: Number.isFinite(requestedCount) ? requestedCount : 0,
    sentCount: 0,
  });
}

export function recordDevLabGenerationProgress(result) {
  const current = getStore();

  if (!current) {
    return null;
  }

  const status = result?.status;
  return setStore({
    ...current,
    ambiguousCount: current.ambiguousCount + (status === "ambiguous" ? 1 : 0),
    failedCount: current.failedCount + (status === "failed" ? 1 : 0),
    phase: "sending",
    processedCount: current.processedCount + 1,
    sentCount: current.sentCount + (status === "sent" ? 1 : 0),
  });
}

export function completeDevLabGenerationProgress({
  ambiguousCount,
  failedCount,
  requestedCount,
  sentCount,
} = {}) {
  const current = getStore() || {};

  return setStore({
    ambiguousCount: Number.isFinite(ambiguousCount) ? ambiguousCount : current.ambiguousCount || 0,
    failedCount: Number.isFinite(failedCount) ? failedCount : current.failedCount || 0,
    phase: "completed",
    processedCount: Number.isFinite(requestedCount) ? requestedCount : current.requestedCount || 0,
    requestedCount: Number.isFinite(requestedCount) ? requestedCount : current.requestedCount || 0,
    sentCount: Number.isFinite(sentCount) ? sentCount : current.sentCount || 0,
  });
}

export function failDevLabGenerationProgress() {
  const current = getStore();

  if (!current) {
    return null;
  }

  return setStore({
    ...current,
    phase: "failed",
  });
}

export function getDevLabGenerationProgress() {
  return sanitize(getStore());
}
