const STORE_KEY = "__pidgeotDevMailDeliveryStore";

function getStore() {
  if (!globalThis[STORE_KEY]) {
    globalThis[STORE_KEY] = new Map();
  }

  return globalThis[STORE_KEY];
}

export function createDevMailDeliveryStore({ store = getStore() } = {}) {
  return {
    get(messageId) {
      return store.get(messageId) || null;
    },
    record({ messageId, outcome, provider }) {
      const current = store.get(messageId) || {
        attempts: [],
        messageId,
        status: "pending",
      };
      const next = {
        attempts: [
          ...current.attempts,
          {
            at: Date.now(),
            outcome,
            provider,
          },
        ],
        messageId,
        status: outcome,
      };

      store.set(messageId, next);
      return next;
    },
  };
}

export function getDevMailDeliveryStore() {
  return createDevMailDeliveryStore();
}
