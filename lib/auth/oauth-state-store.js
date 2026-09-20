import { createRandomToken } from "@/lib/auth/crypto";
import { OAUTH_STATE_TTL_MS } from "@/lib/auth/constants";

export function createOAuthStateStore({ now = () => Date.now(), ttlMs = OAUTH_STATE_TTL_MS } = {}) {
  const stateMap = new Map();

  function cleanupExpiredStates() {
    const currentTime = now();

    for (const [state, record] of stateMap.entries()) {
      if (record.expiresAt <= currentTime) {
        stateMap.delete(state);
      }
    }
  }

  function createState({ codeVerifier, ...metadata }) {
    cleanupExpiredStates();

    const state = createRandomToken();
    const createdAt = now();
    const record = {
      state,
      codeVerifier,
      createdAt,
      expiresAt: createdAt + ttlMs,
      ...metadata,
    };

    stateMap.set(state, record);
    return record;
  }

  function consumeState(state) {
    cleanupExpiredStates();
    const record = stateMap.get(state) || null;

    if (!record) {
      return null;
    }

    stateMap.delete(state);
    return record;
  }

  return {
    cleanupExpiredStates,
    createState,
    consumeState,
  };
}

export const oauthStateStore = createOAuthStateStore();