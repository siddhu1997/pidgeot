import { describe, expect, it } from "vitest";

import {
  areEqualOpaqueValues,
  createPkceCodeChallenge,
  createPkceCodeVerifier,
  deriveAccountKey,
} from "@/lib/auth/crypto";

describe("auth crypto helpers", () => {
  it("creates PKCE values and a stable account key", () => {
    const codeVerifier = createPkceCodeVerifier();
    const codeChallenge = createPkceCodeChallenge(codeVerifier);
    const accountKeyA = deriveAccountKey("USER@example.com", "secret-key");
    const accountKeyB = deriveAccountKey("user@example.com", "secret-key");

    expect(codeVerifier.length).toBeGreaterThan(40);
    expect(codeChallenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(accountKeyA).toBe(accountKeyB);
  });

  it("compares opaque state values safely", () => {
    expect(areEqualOpaqueValues("abc", "abc")).toBe(true);
    expect(areEqualOpaqueValues("abc", "abd")).toBe(false);
    expect(areEqualOpaqueValues("abc", "ab")).toBe(false);
  });
});