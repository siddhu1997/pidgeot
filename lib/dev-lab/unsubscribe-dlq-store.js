import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { getServerAppConfig } from "@/lib/config";
import {
  UNSUBSCRIBE_DLQ_MAX_ENTRIES,
  UNSUBSCRIBE_EXECUTION_RESULT_STATUSES,
  UNSUBSCRIBE_FAILURE_CATEGORIES,
} from "@/lib/unsubscribe/constants";
import { isAutomaticUnsubscribeFailureStatus } from "@/lib/unsubscribe/diagnostics";

const DLQ_RELATIVE_PATH = path.join(".pidgeot", "dev", "unsubscribe-dlq.json");
const ALLOWED_CLASSIFICATIONS = new Set([
  UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.FAILED_PERMANENT,
  UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.FAILED_RETRYABLE,
  UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.MANUAL_ACTION_REQUIRED,
  UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.UNSAFE_TARGET,
]);
const ALLOWED_CATEGORIES = new Set(Object.values(UNSUBSCRIBE_FAILURE_CATEGORIES));

let writeChain = Promise.resolve();

function getDlqFilePath() {
  return path.join(process.cwd(), DLQ_RELATIVE_PATH);
}

function isDevelopmentDlqAvailable() {
  return getServerAppConfig().isProduction !== true;
}

function createEmptyDlq() {
  return [];
}

function sanitizeText(value, maxLength = 180) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return null;
  }

  return normalized.length > maxLength ? normalized.slice(0, maxLength) : normalized;
}

function sanitizeDlqEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const classification = ALLOWED_CLASSIFICATIONS.has(entry.classification)
    ? entry.classification
    : null;
  const failureCategory = ALLOWED_CATEGORIES.has(entry.failureCategory)
    ? entry.failureCategory
    : UNSUBSCRIBE_FAILURE_CATEGORIES.UNKNOWN;

  if (!classification || !isAutomaticUnsubscribeFailureStatus(classification)) {
    return null;
  }

  const httpStatus = Number.isInteger(entry.httpStatus) ? entry.httpStatus : null;
  const attemptNumber = Number.isInteger(entry.attemptNumber) && entry.attemptNumber > 0
    ? entry.attemptNumber
    : 1;

  return {
    attemptNumber,
    classification,
    durationMs: Number.isFinite(entry.durationMs) ? Math.max(0, Math.round(entry.durationMs)) : null,
    failureCategory,
    httpStatus,
    id: sanitizeText(entry.id, 80) || `udlq_${randomUUID()}`,
    mechanismType: sanitizeText(entry.mechanismType, 40),
    operationId: sanitizeText(entry.operationId, 80),
    redirect: entry.redirect && typeof entry.redirect === "object"
      ? {
        locationHost: sanitizeText(entry.redirect.locationHost, 253),
        status: Number.isInteger(entry.redirect.status) ? entry.redirect.status : null,
      }
      : null,
    request: {
      contentType: sanitizeText(entry.request?.contentType, 120) || "application/x-www-form-urlencoded",
      method: sanitizeText(entry.request?.method, 12) || "POST",
    },
    response: entry.response && typeof entry.response === "object"
      ? {
        bodyExcerpt: sanitizeText(entry.response.bodyExcerpt, 300),
        contentType: sanitizeText(entry.response.contentType, 120),
      }
      : null,
    retryable: classification === UNSUBSCRIBE_EXECUTION_RESULT_STATUSES.FAILED_RETRYABLE,
    scanId: sanitizeText(entry.scanId, 80),
    senderGroupId: sanitizeText(entry.senderGroupId, 80),
    senderLabel: sanitizeText(entry.senderLabel, 120),
    sessionId: sanitizeText(entry.sessionId, 80),
    target: {
      host: sanitizeText(entry.target?.host, 253),
      path: sanitizeText(entry.target?.path, 180),
      port: sanitizeText(entry.target?.port, 8),
      scheme: sanitizeText(entry.target?.scheme, 12),
    },
    timestamp: Number.isFinite(entry.timestamp) ? entry.timestamp : Date.now(),
    timeout: Boolean(entry.timeout),
    transportCode: sanitizeText(entry.transportCode, 80),
  };
}

async function readDlqFile() {
  if (!isDevelopmentDlqAvailable()) {
    return createEmptyDlq();
  }

  try {
    const contents = await readFile(getDlqFilePath(), "utf8");
    const parsed = JSON.parse(contents);

    if (!Array.isArray(parsed)) {
      return createEmptyDlq();
    }

    return parsed.map(sanitizeDlqEntry).filter(Boolean);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return createEmptyDlq();
    }

    return createEmptyDlq();
  }
}

async function writeDlqFile(entries) {
  if (!isDevelopmentDlqAvailable()) {
    return;
  }

  const filePath = getDlqFilePath();
  const bounded = entries.slice(-UNSUBSCRIBE_DLQ_MAX_ENTRIES);
  const tmpPath = `${filePath}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(tmpPath, `${JSON.stringify(bounded, null, 2)}\n`, "utf8");
  await rename(tmpPath, filePath);
}

function enqueueWrite(task) {
  const next = writeChain.then(task, task);
  writeChain = next.then(() => undefined, () => undefined);
  return next;
}

export async function listUnsubscribeDlqEntries() {
  if (!isDevelopmentDlqAvailable()) {
    return createEmptyDlq();
  }

  const entries = await readDlqFile();
  return [...entries].sort((left, right) => right.timestamp - left.timestamp);
}

export async function getUnsubscribeDlqCount() {
  if (!isDevelopmentDlqAvailable()) {
    return 0;
  }

  return (await readDlqFile()).length;
}

export async function appendUnsubscribeDlqEntry(entry) {
  if (!isDevelopmentDlqAvailable()) {
    return null;
  }

  const sanitized = sanitizeDlqEntry({
    ...entry,
    id: entry?.id || `udlq_${randomUUID()}`,
    timestamp: entry?.timestamp || Date.now(),
  });

  if (!sanitized) {
    return null;
  }

  return enqueueWrite(async () => {
    const current = await readDlqFile();
    current.push(sanitized);
    await writeDlqFile(current);
    return sanitized;
  });
}

export async function clearUnsubscribeDlq() {
  if (!isDevelopmentDlqAvailable()) {
    return;
  }

  return enqueueWrite(async () => {
    await writeDlqFile(createEmptyDlq());
  });
}

export function getUnsubscribeDlqRelativePath() {
  return DLQ_RELATIVE_PATH;
}
