import { DEFAULT_PROCESSING_LEASE_TTL_SECONDS } from "@/lib/config";

export const PROCESSING_LEASE_STATES = {
  ACTIVE: "ACTIVE",
  EXPIRED: "EXPIRED",
  PAUSED: "PAUSED",
  RELEASED: "RELEASED",
};

export function getProcessingLeaseTtlMs(ttlSeconds = DEFAULT_PROCESSING_LEASE_TTL_SECONDS) {
  return ttlSeconds * 1000;
}

export function createLeaseExpiration({ createdAt, lastHeartbeatAt, ttlMs }) {
  return (lastHeartbeatAt || createdAt) + ttlMs;
}

export function canProcessingLeaseStartNewWork(lease, now = Date.now()) {
  if (!lease) {
    return false;
  }

  if (lease.state !== PROCESSING_LEASE_STATES.ACTIVE) {
    return false;
  }

  return lease.expiresAt > now;
}