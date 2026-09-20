import { WORKFLOW_ACTION_TYPES } from "@/lib/workflow/constants";

function createEmptyGroupState() {
  return {
    [WORKFLOW_ACTION_TYPES.CLEANUP]: null,
    [WORKFLOW_ACTION_TYPES.UNSUBSCRIBE]: null,
  };
}

export function createWorkflowStore({ now = () => Date.now() } = {}) {
  const sessionGroupState = new Map();

  function getSessionState(sessionId) {
    return sessionGroupState.get(sessionId) || null;
  }

  function getOrCreateSessionState(sessionId) {
    const existingState = getSessionState(sessionId);

    if (existingState) {
      return existingState;
    }

    const nextState = new Map();
    sessionGroupState.set(sessionId, nextState);
    return nextState;
  }

  function getGroupState(sessionId, senderGroupId) {
    return getSessionState(sessionId)?.get(senderGroupId) || null;
  }

  function getOrCreateGroupState(sessionId, senderGroupId) {
    const sessionState = getOrCreateSessionState(sessionId);
    const existingGroupState = sessionState.get(senderGroupId);

    if (existingGroupState) {
      return existingGroupState;
    }

    const nextGroupState = createEmptyGroupState();
    sessionState.set(senderGroupId, nextGroupState);
    return nextGroupState;
  }

  function getActionState({ actionType, senderGroupId, sessionId }) {
    return getGroupState(sessionId, senderGroupId)?.[actionType] || null;
  }

  function setActionState({ actionType, senderGroupId, sessionId, state }) {
    const groupState = getOrCreateGroupState(sessionId, senderGroupId);
    const nextState = {
      ...state,
      updatedAt: now(),
    };

    groupState[actionType] = nextState;
    return nextState;
  }

  function clearSession(sessionId) {
    sessionGroupState.delete(sessionId);
  }

  return {
    clearSession,
    getActionState,
    getSessionState,
    setActionState,
  };
}

let cachedStore;

export function getWorkflowStore() {
  if (cachedStore) {
    return cachedStore;
  }

  cachedStore = createWorkflowStore();
  return cachedStore;
}