const handledIdentities = new Map();

export function getManualSenderIdentity(group) {
  return (group?.representativeAddress || group?.id || "").toString().trim().toLowerCase();
}

export function rememberManualHandled({ identity, scanId }) {
  if (!identity) {
    return;
  }

  handledIdentities.set(identity, {
    markedAt: Date.now(),
    scanId: scanId || null,
  });
}

export function isPreviouslyManualHandled({ identity, scanId }) {
  if (!identity) {
    return false;
  }

  const record = handledIdentities.get(identity);

  return Boolean(record?.scanId && scanId && record.scanId !== scanId);
}
