function buildManualHandledKey(accountKey, identity) {
  return `${accountKey}\u0000${identity}`;
}

const handledIdentities = new Map();

export function getManualSenderIdentity(group) {
  return (group?.representativeAddress || group?.id || "").toString().trim().toLowerCase();
}

export function rememberManualHandled({ accountKey, identity, scanId }) {
  if (!accountKey || !identity) {
    return;
  }

  handledIdentities.set(buildManualHandledKey(accountKey, identity), {
    markedAt: Date.now(),
    scanId: scanId || null,
  });
}

export function isPreviouslyManualHandled({ accountKey, identity, scanId }) {
  if (!accountKey || !identity) {
    return false;
  }

  const record = handledIdentities.get(buildManualHandledKey(accountKey, identity));

  return Boolean(record?.scanId && scanId && record.scanId !== scanId);
}
