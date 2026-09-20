import { describe, expect, it } from "vitest";

import { createOAuthStateStore } from "@/lib/auth/oauth-state-store";

describe("oauth state store", () => {
  it("creates and consumes state exactly once", () => {
    const stateStore = createOAuthStateStore();
    const record = stateStore.createState({ codeVerifier: "verifier-1" });

    expect(stateStore.consumeState(record.state)).toMatchObject({
      codeVerifier: "verifier-1",
      state: record.state,
    });
    expect(stateStore.consumeState(record.state)).toBeNull();
  });

  it("drops expired state records", () => {
    let time = 0;
    const stateStore = createOAuthStateStore({ now: () => time, ttlMs: 100 });
    const record = stateStore.createState({ codeVerifier: "verifier-2" });

    time = 200;

    expect(stateStore.consumeState(record.state)).toBeNull();
  });
});