import { createRandomToken } from "@/lib/auth/crypto";
import {
  canProcessingLeaseStartNewWork,
  createLeaseExpiration,
  getProcessingLeaseTtlMs,
  PROCESSING_LEASE_STATES,
} from "@/lib/sessions/processing-lease-policy";

const EXPIRED_PERMIT_STATES = new Set([
  PROCESSING_LEASE_STATES.ACTIVE,
  PROCESSING_LEASE_STATES.PAUSED,
]);

export function createProcessingLeaseStore({
  now = () => Date.now(),
  ttlMs = getProcessingLeaseTtlMs(),
} = {}) {
  const leaseMap = new Map();
  const sessionLeaseMap = new Map();

  function cleanupExpiredLeases() {
    const currentTime = now();

    for (const [leaseId, lease] of leaseMap.entries()) {
      if (lease.expiresAt <= currentTime && EXPIRED_PERMIT_STATES.has(lease.state)) {
        leaseMap.set(leaseId, {
          ...lease,
          state: PROCESSING_LEASE_STATES.EXPIRED,
        });
        sessionLeaseMap.delete(lease.sessionId);
      }
    }
  }

  function getLease({ leaseId, sessionId }) {
    cleanupExpiredLeases();
    const lease = leaseMap.get(leaseId) || null;

    if (!lease || lease.sessionId !== sessionId) {
      return null;
    }

    return lease;
  }

  function acquireLease({ sessionId }) {
    cleanupExpiredLeases();
    const existingLeaseId = sessionLeaseMap.get(sessionId);

    if (existingLeaseId) {
      const existingLease = leaseMap.get(existingLeaseId);

      if (existingLease) {
        leaseMap.set(existingLeaseId, {
          ...existingLease,
          state: PROCESSING_LEASE_STATES.RELEASED,
        });
      }
    }

    const createdAt = now();
    const lease = {
      createdAt,
      expiresAt: createLeaseExpiration({ createdAt, ttlMs }),
      id: createRandomToken(),
      lastHeartbeatAt: createdAt,
      sessionId,
      state: PROCESSING_LEASE_STATES.ACTIVE,
    };

    leaseMap.set(lease.id, lease);
    sessionLeaseMap.set(sessionId, lease.id);
    return lease;
  }

  function heartbeat({ leaseId, sessionId }) {
    const lease = getLease({ leaseId, sessionId });

    if (!lease || lease.state !== PROCESSING_LEASE_STATES.ACTIVE) {
      return null;
    }

    const refreshedAt = now();
    const nextLease = {
      ...lease,
      expiresAt: createLeaseExpiration({
        createdAt: lease.createdAt,
        lastHeartbeatAt: refreshedAt,
        ttlMs,
      }),
      lastHeartbeatAt: refreshedAt,
    };

    leaseMap.set(lease.id, nextLease);
    return nextLease;
  }

  function pauseLease({ leaseId, sessionId }) {
    const lease = getLease({ leaseId, sessionId });

    if (!lease) {
      return null;
    }

    const nextLease = {
      ...lease,
      state: PROCESSING_LEASE_STATES.PAUSED,
    };

    leaseMap.set(lease.id, nextLease);
    return nextLease;
  }

  function resumeLease({ leaseId, sessionId }) {
    const lease = getLease({ leaseId, sessionId });

    if (!lease) {
      return null;
    }

    const refreshedAt = now();
    const nextLease = {
      ...lease,
      expiresAt: createLeaseExpiration({
        createdAt: lease.createdAt,
        lastHeartbeatAt: refreshedAt,
        ttlMs,
      }),
      lastHeartbeatAt: refreshedAt,
      state: PROCESSING_LEASE_STATES.ACTIVE,
    };

    leaseMap.set(lease.id, nextLease);
    sessionLeaseMap.set(sessionId, lease.id);
    return nextLease;
  }

  function releaseLease({ leaseId, sessionId }) {
    const lease = getLease({ leaseId, sessionId });

    if (!lease) {
      return null;
    }

    const nextLease = {
      ...lease,
      state: PROCESSING_LEASE_STATES.RELEASED,
    };

    leaseMap.set(lease.id, nextLease);
    sessionLeaseMap.delete(sessionId);
    return nextLease;
  }

  function expireLease({ leaseId, sessionId }) {
    const lease = getLease({ leaseId, sessionId });

    if (!lease) {
      return null;
    }

    const nextLease = {
      ...lease,
      state: PROCESSING_LEASE_STATES.EXPIRED,
    };

    leaseMap.set(lease.id, nextLease);
    sessionLeaseMap.delete(sessionId);
    return nextLease;
  }

  function releaseLeasesForSession(sessionId) {
    const leaseId = sessionLeaseMap.get(sessionId);

    if (!leaseId) {
      return null;
    }

    return releaseLease({ leaseId, sessionId });
  }

  function canProcess({ leaseId, sessionId }) {
    const lease = getLease({ leaseId, sessionId });
    return canProcessingLeaseStartNewWork(lease, now());
  }

  function ensureActiveLeaseForUserAction({ leaseId, sessionId }) {
    const lease = getLease({ leaseId, sessionId });

    if (!lease || lease.state === PROCESSING_LEASE_STATES.RELEASED) {
      return false;
    }

    if (
      lease.state === PROCESSING_LEASE_STATES.PAUSED
      || lease.state === PROCESSING_LEASE_STATES.EXPIRED
    ) {
      resumeLease({ leaseId, sessionId });
    }

    return canProcess({ leaseId, sessionId });
  }

  return {
    acquireLease,
    canProcess,
    cleanupExpiredLeases,
    ensureActiveLeaseForUserAction,
    expireLease,
    getLease,
    heartbeat,
    pauseLease,
    releaseLease,
    releaseLeasesForSession,
    resumeLease,
  };
}

const PROCESSING_LEASE_STORE_KEY = "__pidgeotProcessingLeaseStore";

export function getProcessingLeaseStore(config) {
  if (globalThis[PROCESSING_LEASE_STORE_KEY]) {
    return globalThis[PROCESSING_LEASE_STORE_KEY];
  }

  const store = createProcessingLeaseStore({
    ttlMs: getProcessingLeaseTtlMs(config.processingLeaseTtlSeconds),
  });

  globalThis[PROCESSING_LEASE_STORE_KEY] = store;

  return store;
}
