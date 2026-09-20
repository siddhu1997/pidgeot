import { describe, expect, it } from "vitest";

import { createProcessingLeaseStore } from "@/lib/sessions/processing-lease-store";
import { PROCESSING_LEASE_STATES } from "@/lib/sessions/processing-lease-policy";

describe("processing lease store", () => {
  it("acquires and heartbeats a lease", () => {
    let time = 0;
    const leaseStore = createProcessingLeaseStore({ now: () => time, ttlMs: 100 });
    const lease = leaseStore.acquireLease({ sessionId: "session-1" });

    time = 50;
    const refreshedLease = leaseStore.heartbeat({ leaseId: lease.id, sessionId: "session-1" });

    expect(refreshedLease.lastHeartbeatAt).toBe(50);
    expect(leaseStore.canProcess({ leaseId: lease.id, sessionId: "session-1" })).toBe(true);
  });

  it("expires a lease and blocks processing", () => {
    let time = 0;
    const leaseStore = createProcessingLeaseStore({ now: () => time, ttlMs: 100 });
    const lease = leaseStore.acquireLease({ sessionId: "session-1" });

    time = 200;

    expect(leaseStore.canProcess({ leaseId: lease.id, sessionId: "session-1" })).toBe(false);
    expect(leaseStore.getLease({ leaseId: lease.id, sessionId: "session-1" }).state).toBe(
      PROCESSING_LEASE_STATES.EXPIRED,
    );
  });

  it("releases leases and enforces session ownership", () => {
    const leaseStore = createProcessingLeaseStore({ ttlMs: 1000 });
    const lease = leaseStore.acquireLease({ sessionId: "session-1" });

    expect(leaseStore.getLease({ leaseId: lease.id, sessionId: "session-2" })).toBeNull();
    expect(leaseStore.releaseLease({ leaseId: lease.id, sessionId: "session-1" }).state).toBe(
      PROCESSING_LEASE_STATES.RELEASED,
    );
    expect(leaseStore.canProcess({ leaseId: lease.id, sessionId: "session-1" })).toBe(false);
  });

  it("explicit pause blocks processing until resumed", () => {
    const leaseStore = createProcessingLeaseStore({ ttlMs: 1000 });
    const lease = leaseStore.acquireLease({ sessionId: "session-1" });

    leaseStore.pauseLease({ leaseId: lease.id, sessionId: "session-1" });
    expect(leaseStore.canProcess({ leaseId: lease.id, sessionId: "session-1" })).toBe(false);

    leaseStore.resumeLease({ leaseId: lease.id, sessionId: "session-1" });
    expect(leaseStore.canProcess({ leaseId: lease.id, sessionId: "session-1" })).toBe(true);
  });
});