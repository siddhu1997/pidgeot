import { createHash } from "node:crypto";

import { classifySenderGroup } from "@/lib/classification/sender-classifier";
import { SENDER_CATEGORIES } from "@/lib/classification/constants";
import { SCAN_SOURCES } from "@/lib/scanning/constants";
import { resolveUnsubscribeMechanisms } from "@/lib/unsubscribe/resolver";

const ADDRESS_SIGNAL_TYPE = "EXACT_ADDRESS_MATCH";
const DISPLAY_NAME_SIGNAL_TYPE = "DISPLAY_NAME_OBSERVED";
const LIST_ID_SIGNAL_TYPE = "LIST_ID_MATCH";
const MALFORMED_FROM_SIGNAL_TYPE = "MALFORMED_FROM_HEADER_MATCH";
const SENDER_DOMAIN_SIGNAL_TYPE = "SENDER_DOMAIN_OBSERVED";
const SENDER_HEADER_FALLBACK_SIGNAL_TYPE = "SENDER_HEADER_FALLBACK";
const UNSUBSCRIBE_DOMAIN_SIGNAL_TYPE = "UNSUBSCRIBE_SERVICE_DOMAIN_OBSERVED";

const FINANCIAL_SURFACE_PATTERNS = ["bank", "banking", "card", "cards", "statement", "statements"];
const CLEANUP_READY_UNSUBSCRIBE_STATUSES = new Set(["AUTOMATIC", "MANUAL_ACTION_REQUIRED", "ONE_CLICK_READY"]);


function collapseWhitespace(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function stripOuterQuotes(value) {
  return value.replace(/^['"]+|['"]+$/g, "").trim();
}

function normalizeDisplayIdentity(value) {
  return collapseWhitespace(value).toLowerCase();
}

function normalizeAddress(addressValue) {
  const trimmedAddress = collapseWhitespace(addressValue);

  if (!trimmedAddress) {
    return null;
  }

  const addressMatch = trimmedAddress.match(/^([^\s@<>]+)@([^\s@<>]+)$/);

  if (!addressMatch) {
    return null;
  }

  return `${addressMatch[1].toLowerCase()}@${addressMatch[2].toLowerCase()}`;
}

function extractDomainFromCanonicalAddress(canonicalAddress) {
  return canonicalAddress?.split("@")[1] || null;
}

function parseAddressHeader(headerValue) {
  const normalizedHeader = collapseWhitespace(headerValue);

  if (!normalizedHeader) {
    return {
      canonicalAddress: null,
      displayName: null,
      domain: null,
      malformedToken: null,
      originalAddress: null,
    };
  }

  const angleAddressMatch = normalizedHeader.match(/^(.*)<([^<>]+)>$/);

  if (angleAddressMatch) {
    const displayName = stripOuterQuotes(collapseWhitespace(angleAddressMatch[1] || "")) || null;
    const originalAddress = collapseWhitespace(angleAddressMatch[2]);
    const canonicalAddress = normalizeAddress(originalAddress);

    if (!canonicalAddress) {
      return {
        canonicalAddress: null,
        displayName,
        domain: null,
        malformedToken: normalizedHeader.toLowerCase(),
        originalAddress,
      };
    }

    return {
      canonicalAddress,
      displayName,
      domain: extractDomainFromCanonicalAddress(canonicalAddress),
      malformedToken: null,
      originalAddress,
    };
  }

  const canonicalAddress = normalizeAddress(normalizedHeader);

  if (canonicalAddress) {
    return {
      canonicalAddress,
      displayName: null,
      domain: extractDomainFromCanonicalAddress(canonicalAddress),
      malformedToken: null,
      originalAddress: normalizedHeader,
    };
  }

  return {
    canonicalAddress: null,
    displayName: null,
    domain: null,
    malformedToken: normalizedHeader.toLowerCase(),
    originalAddress: null,
  };
}

function derivePrimarySenderIdentity(message) {
  const fromIdentity = parseAddressHeader(message?.headers?.from);

  if (fromIdentity.canonicalAddress || fromIdentity.malformedToken) {
    return {
      ...fromIdentity,
      addressSource: "FROM",
    };
  }

  const senderIdentity = parseAddressHeader(message?.headers?.sender);

  if (senderIdentity.canonicalAddress || senderIdentity.malformedToken) {
    return {
      ...senderIdentity,
      addressSource: "SENDER",
    };
  }

  return {
    ...fromIdentity,
    addressSource: null,
  };
}

function normalizeListId(listIdValue) {
  const normalizedValue = collapseWhitespace(listIdValue);

  if (!normalizedValue) {
    return null;
  }

  const angleIdMatch = normalizedValue.match(/^(?:.*<)?([^<>\s]+)(?:>)?$/);

  if (!angleIdMatch) {
    return null;
  }

  if ((normalizedValue.includes("<") && !normalizedValue.includes(">")) || /\s/.test(angleIdMatch[1])) {
    return null;
  }

  return angleIdMatch[1].toLowerCase();
}

function extractListUnsubscribeTargets(headerValue) {
  const normalizedValue = collapseWhitespace(headerValue);

  if (!normalizedValue) {
    return [];
  }

  const angleMatches = Array.from(normalizedValue.matchAll(/<([^>]+)>/g)).map((match) => collapseWhitespace(match[1]));

  if (angleMatches.length > 0) {
    return angleMatches.filter(Boolean);
  }

  return normalizedValue
    .split(",")
    .map((part) => collapseWhitespace(part))
    .filter(Boolean);
}

function extractDomainFromTarget(target) {
  if (!target) {
    return null;
  }

  if (target.toLowerCase().startsWith("mailto:")) {
    const emailAddress = target.slice("mailto:".length).split("?")[0] || "";
    return extractDomainFromCanonicalAddress(normalizeAddress(emailAddress));
  }

  try {
    const url = new URL(target);

    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.hostname.toLowerCase() || null;
    }
  } catch {
    return null;
  }

  return null;
}

function hasHeaderValue(value) {
  return collapseWhitespace(value).length > 0;
}

function normalizePrecedenceValue(value) {
  return collapseWhitespace(value).toLowerCase();
}

function buildMessageIdentity(message) {
  const senderIdentity = derivePrimarySenderIdentity(message);
  const listId = normalizeListId(message?.headers?.listId);
  const unread = Array.isArray(message?.labelIds) && message.labelIds.includes("UNREAD");
  const unsubscribeDomains = extractListUnsubscribeTargets(message?.headers?.listUnsubscribe)
    .map(extractDomainFromTarget)
    .filter(Boolean);
  const senderDomains = senderIdentity.domain ? [senderIdentity.domain] : [];
  const unsubscribeServiceDomains = unsubscribeDomains.filter(
    (domain) => !senderDomains.includes(domain),
  );
  const seedKeys = [];

  if (senderIdentity.canonicalAddress) {
    seedKeys.push(`address:${senderIdentity.canonicalAddress}`);
  }

  if (listId) {
    seedKeys.push(`list:${listId}`);
  }

  if (!senderIdentity.canonicalAddress && senderIdentity.malformedToken) {
    seedKeys.push(`malformed:${senderIdentity.malformedToken}`);
  }

  if (seedKeys.length === 0) {
    seedKeys.push(`message:${message.id}`);
  }

  return {
    canonicalAddress: senderIdentity.canonicalAddress,
    displayName: senderIdentity.displayName,
    listId,
    malformedToken: senderIdentity.canonicalAddress ? null : senderIdentity.malformedToken,
    originalAddress: senderIdentity.originalAddress,
    seedKeys,
    senderDomains,
    senderHeaderFallback: senderIdentity.addressSource === "SENDER",
    unread,
    unsubscribeServiceDomains,
  };
}

function createSenderGroupState() {
  return {
    groupIdByCanonicalAddress: new Map(),
    groupIdByListId: new Map(),
    groupIdByMalformedToken: new Map(),
    groupOrder: [],
    groupsById: new Map(),
    processedMessageIds: new Set(),
  };
}

function createSenderGroup(seedKeys) {
  return {
    activeCount: 0,
    addressEntriesByCanonical: new Map(),
    displayNames: new Set(),
    groupId: null,
    groupingSignals: new Map(),
    malformedSenderTokens: new Set(),
    messageIds: new Set(),
    messageCount: 0,
    representativeAddress: null,
    representativeDomain: null,
    seedKeys: new Set(seedKeys),
    senderDomains: new Set(),
    metadataSignals: {
      listIdMessageCount: 0,
      listUnsubscribeMessageCount: 0,
      listUnsubscribePostMessageCount: 0,
      precedenceBulkMessageCount: 0,
      precedenceListMessageCount: 0,
      replyToMessageCount: 0,
      senderHeaderMessageCount: 0,
    },
    sourceCounts: {
      [SCAN_SOURCES.ACTIVE_MAIL]: 0,
      [SCAN_SOURCES.TRASH]: 0,
    },
    trashCount: 0,
    unreadCount: 0,
    unsubscribeObservationsByKey: new Map(),
    unsubscribeServiceDomains: new Set(),
  };
}

function createStableGroupId(seedKeys) {
  const stableSeed = [...seedKeys].sort()[0] || "group:unknown";
  return `sg_${createHash("sha256").update(stableSeed).digest("hex").slice(0, 24)}`;
}

function addSignal(group, type, value = null) {
  const key = `${type}:${value || ""}`;

  if (!group.groupingSignals.has(key)) {
    group.groupingSignals.set(key, value == null ? { type } : { type, value });
  }
}

function chooseRepresentativeAddress(addressEntriesByCanonical) {
  return [...addressEntriesByCanonical.keys()].sort()[0] || null;
}

function chooseRepresentativeDomain(senderDomains) {
  return [...senderDomains].sort()[0] || null;
}

function getComparableOrganizationDomain(domain) {
  const normalizedDomain = collapseWhitespace(domain).toLowerCase();

  if (!normalizedDomain) {
    return null;
  }

  const labels = normalizedDomain.split(".").filter(Boolean);

  if (labels.length < 2) {
    return normalizedDomain;
  }

  const topLevelDomain = labels.at(-1) || "";

  if (topLevelDomain.length <= 2) {
    return null;
  }

  return labels.slice(-2).join(".");
}

function domainsShareFamily(leftDomain, rightDomain) {
  const left = collapseWhitespace(leftDomain).toLowerCase();
  const right = collapseWhitespace(rightDomain).toLowerCase();

  if (!left || !right) {
    return false;
  }

  if (left === right || left.endsWith(`.${right}`) || right.endsWith(`.${left}`)) {
    return true;
  }

  const leftOrganizationDomain = getComparableOrganizationDomain(left);
  const rightOrganizationDomain = getComparableOrganizationDomain(right);

  return Boolean(
    leftOrganizationDomain &&
      rightOrganizationDomain &&
      leftOrganizationDomain === rightOrganizationDomain,
  );
}

function collectDomainFamilyBridgeGroupIds(state, messageIdentity) {
  const normalizedDisplayName = normalizeDisplayIdentity(messageIdentity.displayName);

  if (!normalizedDisplayName || messageIdentity.senderDomains.length === 0) {
    return [];
  }

  const candidateGroupIds = new Set();

  for (const group of state.groupsById.values()) {
    if (!group) {
      continue;
    }

    const hasMatchingDisplayName = [...group.displayNames].some(
      (displayName) => normalizeDisplayIdentity(displayName) === normalizedDisplayName,
    );

    if (!hasMatchingDisplayName) {
      continue;
    }

    const groupDomains = [...group.senderDomains];

    if (
      messageIdentity.senderDomains.some((senderDomain) => (
        groupDomains.some((groupDomain) => domainsShareFamily(senderDomain, groupDomain))
      ))
    ) {
      candidateGroupIds.add(group.groupId);
    }
  }

  return [...candidateGroupIds];
}

function mergeAddressEntries(targetEntries, sourceEntries) {
  for (const [canonicalAddress, addressEntry] of sourceEntries.entries()) {
    const existingEntry = targetEntries.get(canonicalAddress);

    if (!existingEntry) {
      targetEntries.set(canonicalAddress, {
        canonicalAddress,
        originalAddresses: new Set(addressEntry.originalAddresses),
      });
      continue;
    }

    for (const originalAddress of addressEntry.originalAddresses) {
      existingEntry.originalAddresses.add(originalAddress);
    }
  }
}

function mergeGroups(targetGroup, sourceGroup) {
  mergeAddressEntries(targetGroup.addressEntriesByCanonical, sourceGroup.addressEntriesByCanonical);

  for (const displayName of sourceGroup.displayNames) {
    targetGroup.displayNames.add(displayName);
  }

  for (const malformedToken of sourceGroup.malformedSenderTokens) {
    targetGroup.malformedSenderTokens.add(malformedToken);
  }

  for (const [observationKey, observation] of sourceGroup.unsubscribeObservationsByKey.entries()) {
    targetGroup.unsubscribeObservationsByKey.set(observationKey, observation);
  }

  for (const messageId of sourceGroup.messageIds) {
    targetGroup.messageIds.add(messageId);
  }

  targetGroup.metadataSignals.listIdMessageCount += sourceGroup.metadataSignals.listIdMessageCount;
  targetGroup.metadataSignals.listUnsubscribeMessageCount += sourceGroup.metadataSignals.listUnsubscribeMessageCount;
  targetGroup.metadataSignals.listUnsubscribePostMessageCount += sourceGroup.metadataSignals.listUnsubscribePostMessageCount;
  targetGroup.metadataSignals.precedenceBulkMessageCount += sourceGroup.metadataSignals.precedenceBulkMessageCount;
  targetGroup.metadataSignals.precedenceListMessageCount += sourceGroup.metadataSignals.precedenceListMessageCount;
  targetGroup.metadataSignals.replyToMessageCount += sourceGroup.metadataSignals.replyToMessageCount;
  targetGroup.metadataSignals.senderHeaderMessageCount += sourceGroup.metadataSignals.senderHeaderMessageCount;

  targetGroup.messageCount += sourceGroup.messageCount;
  targetGroup.unreadCount += sourceGroup.unreadCount;
  targetGroup.activeCount += sourceGroup.activeCount;
  targetGroup.trashCount += sourceGroup.trashCount;
  targetGroup.sourceCounts[SCAN_SOURCES.ACTIVE_MAIL] += sourceGroup.sourceCounts[SCAN_SOURCES.ACTIVE_MAIL];
  targetGroup.sourceCounts[SCAN_SOURCES.TRASH] += sourceGroup.sourceCounts[SCAN_SOURCES.TRASH];

  for (const senderDomain of sourceGroup.senderDomains) {
    targetGroup.senderDomains.add(senderDomain);
  }

  for (const unsubscribeDomain of sourceGroup.unsubscribeServiceDomains) {
    targetGroup.unsubscribeServiceDomains.add(unsubscribeDomain);
  }

  for (const seedKey of sourceGroup.seedKeys) {
    targetGroup.seedKeys.add(seedKey);
  }

  for (const [signalKey, signal] of sourceGroup.groupingSignals.entries()) {
    targetGroup.groupingSignals.set(signalKey, signal);
  }

  targetGroup.representativeAddress = chooseRepresentativeAddress(targetGroup.addressEntriesByCanonical);
  targetGroup.representativeDomain = chooseRepresentativeDomain(targetGroup.senderDomains);
}

function reindexGroup(state, group, previousGroupId = null) {
  if (previousGroupId && previousGroupId !== group.groupId) {
    state.groupsById.delete(previousGroupId);
    const groupOrderIndex = state.groupOrder.indexOf(previousGroupId);

    if (groupOrderIndex >= 0) {
      state.groupOrder.splice(groupOrderIndex, 1, group.groupId);
    }
  }

  state.groupsById.set(group.groupId, group);

  if (!state.groupOrder.includes(group.groupId)) {
    state.groupOrder.push(group.groupId);
  }

  for (const canonicalAddress of group.addressEntriesByCanonical.keys()) {
    state.groupIdByCanonicalAddress.set(canonicalAddress, group.groupId);
  }

  for (const signal of group.groupingSignals.values()) {
    if (signal.type === LIST_ID_SIGNAL_TYPE) {
      state.groupIdByListId.set(signal.value, group.groupId);
    }
  }

  for (const malformedToken of group.malformedSenderTokens) {
    state.groupIdByMalformedToken.set(malformedToken, group.groupId);
  }
}

function absorbGroups(state, candidateGroupIds, seedKeys) {
  const sortedCandidateGroupIds = [...candidateGroupIds].sort();
  const baseGroupId = sortedCandidateGroupIds[0];
  const baseGroup = state.groupsById.get(baseGroupId);

  for (const seedKey of seedKeys) {
    baseGroup.seedKeys.add(seedKey);
  }

  for (const groupId of sortedCandidateGroupIds.slice(1)) {
    const group = state.groupsById.get(groupId);

    if (!group) {
      continue;
    }

    mergeGroups(baseGroup, group);
    state.groupsById.delete(groupId);
    state.groupOrder = state.groupOrder.filter((existingGroupId) => existingGroupId !== groupId);
  }

  const previousGroupId = baseGroup.groupId;
  baseGroup.groupId = createStableGroupId(baseGroup.seedKeys);
  reindexGroup(state, baseGroup, previousGroupId);
  return baseGroup;
}

function resolveGroupForIdentity(state, messageIdentity) {
  const candidateGroupIds = new Set();

  if (messageIdentity.canonicalAddress) {
    const groupId = state.groupIdByCanonicalAddress.get(messageIdentity.canonicalAddress);

    if (groupId) {
      candidateGroupIds.add(groupId);
    }
  }

  if (messageIdentity.listId) {
    const groupId = state.groupIdByListId.get(messageIdentity.listId);

    if (groupId) {
      candidateGroupIds.add(groupId);
    }
  }

  if (!messageIdentity.canonicalAddress && messageIdentity.malformedToken) {
    const groupId = state.groupIdByMalformedToken.get(messageIdentity.malformedToken);

    if (groupId) {
      candidateGroupIds.add(groupId);
    }
  }

  for (const groupId of collectDomainFamilyBridgeGroupIds(state, messageIdentity)) {
    candidateGroupIds.add(groupId);
  }

  if (candidateGroupIds.size === 0) {
    const nextGroup = createSenderGroup(messageIdentity.seedKeys);
    nextGroup.groupId = createStableGroupId(nextGroup.seedKeys);
    reindexGroup(state, nextGroup);
    return nextGroup;
  }

  return absorbGroups(state, candidateGroupIds, messageIdentity.seedKeys);
}

function addMessageToGroup(group, message, messageIdentity) {
  const precedenceValue = normalizePrecedenceValue(message?.headers?.precedence);
  const listUnsubscribeValue = collapseWhitespace(message?.headers?.listUnsubscribe);
  const listUnsubscribePostValue = collapseWhitespace(message?.headers?.listUnsubscribePost);

  group.messageCount += 1;
  group.messageIds.add(message.id);

  if (messageIdentity.unread) {
    group.unreadCount += 1;
  }

  if (message.source === SCAN_SOURCES.TRASH) {
    group.trashCount += 1;
    group.sourceCounts[SCAN_SOURCES.TRASH] += 1;
  } else {
    group.activeCount += 1;
    group.sourceCounts[SCAN_SOURCES.ACTIVE_MAIL] += 1;
  }

  if (messageIdentity.canonicalAddress) {
    const existingEntry = group.addressEntriesByCanonical.get(messageIdentity.canonicalAddress);

    if (!existingEntry) {
      group.addressEntriesByCanonical.set(messageIdentity.canonicalAddress, {
        canonicalAddress: messageIdentity.canonicalAddress,
        originalAddresses: new Set(messageIdentity.originalAddress ? [messageIdentity.originalAddress] : []),
      });
    } else if (messageIdentity.originalAddress) {
      existingEntry.originalAddresses.add(messageIdentity.originalAddress);
    }

    addSignal(group, ADDRESS_SIGNAL_TYPE, messageIdentity.canonicalAddress);
  }

  if (messageIdentity.displayName) {
    group.displayNames.add(messageIdentity.displayName);
    addSignal(group, DISPLAY_NAME_SIGNAL_TYPE, messageIdentity.displayName);
  }

  if (messageIdentity.listId) {
    addSignal(group, LIST_ID_SIGNAL_TYPE, messageIdentity.listId);
  }

  if (messageIdentity.senderHeaderFallback) {
    addSignal(group, SENDER_HEADER_FALLBACK_SIGNAL_TYPE);
  }

  if (messageIdentity.listId) {
    group.metadataSignals.listIdMessageCount += 1;
  }

  if (hasHeaderValue(message?.headers?.listUnsubscribe)) {
    group.metadataSignals.listUnsubscribeMessageCount += 1;

    const observationKey = `${listUnsubscribeValue}\n${listUnsubscribePostValue}`;
    group.unsubscribeObservationsByKey.set(observationKey, {
      listUnsubscribe: listUnsubscribeValue,
      listUnsubscribePost: listUnsubscribePostValue || null,
    });
  }

  if (hasHeaderValue(message?.headers?.listUnsubscribePost)) {
    group.metadataSignals.listUnsubscribePostMessageCount += 1;
  }

  if (hasHeaderValue(message?.headers?.replyTo)) {
    group.metadataSignals.replyToMessageCount += 1;
  }

  if (hasHeaderValue(message?.headers?.sender)) {
    group.metadataSignals.senderHeaderMessageCount += 1;
  }

  if (precedenceValue.includes("bulk") || precedenceValue.includes("junk")) {
    group.metadataSignals.precedenceBulkMessageCount += 1;
  }

  if (precedenceValue.includes("list")) {
    group.metadataSignals.precedenceListMessageCount += 1;
  }

  for (const senderDomain of messageIdentity.senderDomains) {
    group.senderDomains.add(senderDomain);
    addSignal(group, SENDER_DOMAIN_SIGNAL_TYPE, senderDomain);
  }

  for (const unsubscribeDomain of messageIdentity.unsubscribeServiceDomains) {
    group.unsubscribeServiceDomains.add(unsubscribeDomain);
    addSignal(group, UNSUBSCRIBE_DOMAIN_SIGNAL_TYPE, unsubscribeDomain);
  }

  if (!messageIdentity.canonicalAddress && messageIdentity.malformedToken) {
    group.malformedSenderTokens.add(messageIdentity.malformedToken);
    addSignal(group, MALFORMED_FROM_SIGNAL_TYPE);
  }

  group.representativeAddress = chooseRepresentativeAddress(group.addressEntriesByCanonical);
  group.representativeDomain = chooseRepresentativeDomain(group.senderDomains);
}

export function getSenderGroupById(state, groupId) {
  if (!state || !groupId) {
    return null;
  }

  return state.groupsById.get(groupId) || null;
}

export function resolveSenderGroupUnsubscribe(group) {
  return resolveUnsubscribeMechanisms({
    observations: [...group.unsubscribeObservationsByKey.values()],
  });
}

export function ingestMessagesIntoSenderGroups(state, messages) {
  const nextState = state || createSenderGroupState();

  for (const message of messages) {
    if (!message?.id || nextState.processedMessageIds.has(message.id)) {
      continue;
    }

    const messageIdentity = buildMessageIdentity(message);
    const group = resolveGroupForIdentity(nextState, messageIdentity);
    addMessageToGroup(group, message, messageIdentity);
    reindexGroup(nextState, group);
    nextState.processedMessageIds.add(message.id);
  }

  return nextState;
}

function sortSignals(groupingSignals) {
  return [...groupingSignals.values()].sort((left, right) => {
    const leftKey = `${left.type}:${left.value || ""}`;
    const rightKey = `${right.type}:${right.value || ""}`;
    return leftKey.localeCompare(rightKey);
  });
}

function sortAddressEntries(addressEntriesByCanonical) {
  return [...addressEntriesByCanonical.values()]
    .map((entry) => {
      const originalAddresses = [...entry.originalAddresses].sort();

      return {
        canonicalAddress: entry.canonicalAddress,
        originalAddress: originalAddresses[0] || entry.canonicalAddress,
        originalAddresses,
      };
    })
    .sort((left, right) => left.canonicalAddress.localeCompare(right.canonicalAddress));
}

function deriveCleanupSurface(classification, group, unsubscribeSummary) {
  const corpus = [
    group.representativeAddress,
    group.representativeDomain,
    ...group.displayNames,
    ...group.senderDomains,
  ]
    .filter(Boolean)
    .map(normalizeDisplayIdentity);
  const financialPatternMatched = FINANCIAL_SURFACE_PATTERNS.some(
    (pattern) => corpus.some((value) => value.includes(pattern)),
  );
  const sensitiveFinancial = financialPatternMatched;
  const hasUsableUnsubscribePath = CLEANUP_READY_UNSUBSCRIBE_STATUSES.has(
    unsubscribeSummary?.resolutionStatus || "",
  );

  if (sensitiveFinancial) {
    return {
      cleanupCandidate: false,
      surfaceDisposition: "SENSITIVE_FINANCIAL",
    };
  }

  if (!hasUsableUnsubscribePath) {
    return {
      cleanupCandidate: false,
      surfaceDisposition: "DISCOVERY_ONLY",
    };
  }

  return {
    cleanupCandidate: true,
    surfaceDisposition: "ACTIONABLE",
  };
}

export function sanitizeSenderGroup(group) {
  const displayNames = [...group.displayNames].sort();
  const unsubscribeResolution = resolveSenderGroupUnsubscribe(group);
  const classification = classifySenderGroup({
    addresses: sortAddressEntries(group.addressEntriesByCanonical),
    displayNames,
    groupingSignals: sortSignals(group.groupingSignals),
    messageCount: group.messageCount,
    metadataSignals: { ...group.metadataSignals },
    representativeAddress: group.representativeAddress,
    representativeDomain: group.representativeDomain,
    senderDomains: [...group.senderDomains].sort(),
    sourceCounts: {
      [SCAN_SOURCES.ACTIVE_MAIL]: group.sourceCounts[SCAN_SOURCES.ACTIVE_MAIL],
      [SCAN_SOURCES.TRASH]: group.sourceCounts[SCAN_SOURCES.TRASH],
    },
    trashCount: group.trashCount,
    unreadCount: group.unreadCount,
    unsubscribeServiceDomains: [...group.unsubscribeServiceDomains].sort(),
  });
  const cleanupSurface = deriveCleanupSurface(
    classification,
    group,
    unsubscribeResolution.summary,
  );

  return {
    activeCount: group.activeCount,
    attention: classification.attention,
    attentionSignals: classification.attentionSignals,
    addresses: sortAddressEntries(group.addressEntriesByCanonical),
    category: classification.category,
    classificationSignals: classification.classificationSignals,
    displayName: displayNames[0] || null,
    displayNames,
    groupingSignals: sortSignals(group.groupingSignals),
    id: group.groupId,
    cleanupCandidate: cleanupSurface.cleanupCandidate,
    messageCount: group.messageCount,
    representativeAddress: group.representativeAddress,
    representativeDomain: group.representativeDomain,
    senderDomains: [...group.senderDomains].sort(),
    sourceCounts: {
      [SCAN_SOURCES.ACTIVE_MAIL]: group.sourceCounts[SCAN_SOURCES.ACTIVE_MAIL],
      [SCAN_SOURCES.TRASH]: group.sourceCounts[SCAN_SOURCES.TRASH],
    },
    surfaceDisposition: cleanupSurface.surfaceDisposition,
    trashCount: group.trashCount,
    unreadCount: group.unreadCount,
    unsubscribe: unsubscribeResolution.summary,
    unsubscribeServiceDomains: [...group.unsubscribeServiceDomains].sort(),
  };
}

export function listSanitizedSenderGroups(state) {
  if (!state) {
    return [];
  }

  return state.groupOrder
    .map((groupId) => state.groupsById.get(groupId))
    .filter(Boolean)
    .map(sanitizeSenderGroup);
}

export function getSenderGroupingStateShape() {
  return createSenderGroupState();
}