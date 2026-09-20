import {
  ATTENTION_LEVELS,
  CATEGORY_PRECEDENCE,
  CLASSIFICATION_THRESHOLDS,
  SENDER_CATEGORIES,
  SIGNAL_STRENGTHS,
} from "@/lib/classification/constants";

const AMBIGUOUS_CATEGORY_PAIRS = new Set([
  [SENDER_CATEGORIES.NEWSLETTER, SENDER_CATEGORIES.PROMOTIONAL].sort().join(":"),
  [SENDER_CATEGORIES.PROMOTIONAL, SENDER_CATEGORIES.UPDATES].sort().join(":"),
  [SENDER_CATEGORIES.TRANSACTIONAL, SENDER_CATEGORIES.UPDATES].sort().join(":"),
]);

const ADDRESS_PATTERNS = {
  [SENDER_CATEGORIES.NEWSLETTER]: ["newsletter", "digest", "briefing", "bulletin", "roundup"],
  [SENDER_CATEGORIES.NOTIFICATION]: ["alert", "alerts", "notification", "notifications", "noreply", "no-reply", "system", "monitor"],
  [SENDER_CATEGORIES.PROMOTIONAL]: ["promo", "promotions", "offer", "offers", "deal", "deals", "sale", "sales", "coupon", "coupons", "marketing"],
  [SENDER_CATEGORIES.SOCIAL]: ["social", "community", "forum", "comment", "comments", "mention", "mentions", "invite", "invites", "follow", "follows", "reply", "replies"],
  [SENDER_CATEGORIES.TRANSACTIONAL]: ["receipt", "receipts", "order", "orders", "billing", "invoice", "payment", "payments", "account", "accounts", "verify", "verification", "password", "statement"],
  [SENDER_CATEGORIES.UPDATES]: ["update", "updates", "release", "releases", "changelog", "status", "product"],
};

function ratio(count, total) {
  return total > 0 ? count / total : 0;
}

function normalizeText(value) {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function buildSearchCorpus(input) {
  const addresses = Array.isArray(input.addresses) ? input.addresses : [];
  const displayNames = Array.isArray(input.displayNames) ? input.displayNames : [];
  const senderDomains = Array.isArray(input.senderDomains) ? input.senderDomains : [];
  const localParts = addresses
    .map((entry) => normalizeText(entry.canonicalAddress).split("@")[0])
    .filter(Boolean);

  return [
    ...addresses.flatMap((entry) => [entry.canonicalAddress, entry.originalAddress]),
    ...displayNames,
    ...senderDomains,
    ...localParts,
  ].map(normalizeText);
}

function hasPattern(input, category) {
  const corpus = buildSearchCorpus(input);
  return ADDRESS_PATTERNS[category].some((pattern) => corpus.some((value) => value.includes(pattern)));
}

function addEvidence(scoreMap, signalMap, category, signal, score) {
  scoreMap.set(category, (scoreMap.get(category) || 0) + score);

  if (!signalMap.has(category)) {
    signalMap.set(category, []);
  }

  signalMap.get(category).push(signal);
}

function sortSignals(signals) {
  return [...signals].sort((left, right) => {
    const leftKey = `${left.type}:${JSON.stringify(left.value || "")}`;
    const rightKey = `${right.type}:${JSON.stringify(right.value || "")}`;
    return leftKey.localeCompare(rightKey);
  });
}

function isRecurring(messageCount) {
  return messageCount >= CLASSIFICATION_THRESHOLDS.RECURRING_MESSAGE_COUNT;
}

function hasAmbiguousPair(leftCategory, rightCategory) {
  return AMBIGUOUS_CATEGORY_PAIRS.has([leftCategory, rightCategory].sort().join(":"));
}

function extractDerivedSignals(input) {
  const metadata = input.metadataSignals || {};
  const messageCount = input.messageCount || 0;

  return {
    bulkRatio: ratio((metadata.precedenceBulkMessageCount || 0) + (metadata.precedenceListMessageCount || 0), messageCount),
    hasListIdSignal: (metadata.listIdMessageCount || 0) > 0,
    hasListUnsubscribePostSignal: (metadata.listUnsubscribePostMessageCount || 0) > 0,
    hasReplyToSignal: (metadata.replyToMessageCount || 0) > 0,
    hasSenderHeaderSignal: (metadata.senderHeaderMessageCount || 0) > 0,
    listIdRatio: ratio(metadata.listIdMessageCount || 0, messageCount),
    listUnsubscribeRatio: ratio(metadata.listUnsubscribeMessageCount || 0, messageCount),
    recurring: isRecurring(messageCount),
    trashRatio: ratio(input.trashCount || 0, messageCount),
    unreadRatio: ratio(input.unreadCount || 0, messageCount),
  };
}

function classifyCategory(input) {
  const scoreMap = new Map();
  const signalMap = new Map();
  const derived = extractDerivedSignals(input);
  const messageCount = input.messageCount || 0;
  const unsubscribeServiceDomainCount = Array.isArray(input.unsubscribeServiceDomains)
    ? input.unsubscribeServiceDomains.length
    : 0;

  if (derived.recurring && derived.listIdRatio >= CLASSIFICATION_THRESHOLDS.LIST_HEADER_RATIO_STRONG) {
    addEvidence(scoreMap, signalMap, SENDER_CATEGORIES.NEWSLETTER, {
      strength: SIGNAL_STRENGTHS.STRONG,
      type: "LIST_ID_RECURRING",
      value: derived.listIdRatio,
    }, 3);
  }

  if (derived.recurring && derived.listUnsubscribeRatio >= CLASSIFICATION_THRESHOLDS.LIST_HEADER_RATIO_STRONG) {
    addEvidence(scoreMap, signalMap, SENDER_CATEGORIES.NEWSLETTER, {
      strength: SIGNAL_STRENGTHS.STRONG,
      type: "LIST_UNSUBSCRIBE_PRESENT",
      value: derived.listUnsubscribeRatio,
    }, 2);
  }

  if (derived.hasListUnsubscribePostSignal) {
    addEvidence(scoreMap, signalMap, SENDER_CATEGORIES.NEWSLETTER, {
      strength: SIGNAL_STRENGTHS.SUPPORTING,
      type: "LIST_UNSUBSCRIBE_POST_PRESENT",
    }, 1);
  }

  if (derived.bulkRatio >= CLASSIFICATION_THRESHOLDS.HEADER_RATIO_SUPPORTING) {
    addEvidence(scoreMap, signalMap, SENDER_CATEGORIES.NEWSLETTER, {
      strength: SIGNAL_STRENGTHS.SUPPORTING,
      type: "BULK_PRECEDENCE_PRESENT",
      value: derived.bulkRatio,
    }, 1);
  }

  if (hasPattern(input, SENDER_CATEGORIES.NEWSLETTER)) {
    addEvidence(scoreMap, signalMap, SENDER_CATEGORIES.NEWSLETTER, {
      strength: SIGNAL_STRENGTHS.SUPPORTING,
      type: "NEWSLETTER_ADDRESS_PATTERN",
    }, 1);
  }

  if (
    derived.recurring &&
    unsubscribeServiceDomainCount > 0 &&
    derived.listUnsubscribeRatio >= CLASSIFICATION_THRESHOLDS.HEADER_RATIO_SUPPORTING
  ) {
    addEvidence(scoreMap, signalMap, SENDER_CATEGORIES.PROMOTIONAL, {
      strength: SIGNAL_STRENGTHS.STRONG,
      type: "UNSUBSCRIBE_INFRASTRUCTURE_PRESENT",
      value: unsubscribeServiceDomainCount,
    }, 2);
  }

  if (hasPattern(input, SENDER_CATEGORIES.PROMOTIONAL)) {
    addEvidence(scoreMap, signalMap, SENDER_CATEGORIES.PROMOTIONAL, {
      strength: SIGNAL_STRENGTHS.STRONG,
      type: "PROMOTIONAL_ADDRESS_PATTERN",
    }, 2);
  }

  if (derived.recurring && derived.hasListUnsubscribePostSignal) {
    addEvidence(scoreMap, signalMap, SENDER_CATEGORIES.PROMOTIONAL, {
      strength: SIGNAL_STRENGTHS.SUPPORTING,
      type: "ONE_CLICK_UNSUBSCRIBE_SIGNAL",
    }, 1);
  }

  if (messageCount >= CLASSIFICATION_THRESHOLDS.ATTENTION_HIGH_MESSAGE_COUNT) {
    addEvidence(scoreMap, signalMap, SENDER_CATEGORIES.PROMOTIONAL, {
      strength: SIGNAL_STRENGTHS.SUPPORTING,
      type: "HIGH_SENDER_FREQUENCY",
      value: messageCount,
    }, 1);
  }

  if (derived.unreadRatio >= CLASSIFICATION_THRESHOLDS.ATTENTION_HIGH_UNREAD_RATIO || derived.trashRatio >= CLASSIFICATION_THRESHOLDS.ATTENTION_MEDIUM_TRASH_RATIO) {
    addEvidence(scoreMap, signalMap, SENDER_CATEGORIES.PROMOTIONAL, {
      strength: SIGNAL_STRENGTHS.SUPPORTING,
      type: "LOW_ENGAGEMENT_PATTERN",
      value: {
        trashRatio: derived.trashRatio,
        unreadRatio: derived.unreadRatio,
      },
    }, 1);
  }

  if (hasPattern(input, SENDER_CATEGORIES.SOCIAL)) {
    addEvidence(scoreMap, signalMap, SENDER_CATEGORIES.SOCIAL, {
      strength: SIGNAL_STRENGTHS.STRONG,
      type: "SOCIAL_ADDRESS_PATTERN",
    }, 2);
  }

  if (derived.recurring && (derived.hasReplyToSignal || derived.hasSenderHeaderSignal)) {
    addEvidence(scoreMap, signalMap, SENDER_CATEGORIES.SOCIAL, {
      strength: SIGNAL_STRENGTHS.SUPPORTING,
      type: "INTERACTION_HEADER_PATTERN",
    }, 1);
  }

  if (hasPattern(input, SENDER_CATEGORIES.NOTIFICATION)) {
    addEvidence(scoreMap, signalMap, SENDER_CATEGORIES.NOTIFICATION, {
      strength: SIGNAL_STRENGTHS.STRONG,
      type: "NOTIFICATION_ADDRESS_PATTERN",
    }, 2);
  }

  if (derived.hasReplyToSignal || derived.hasSenderHeaderSignal) {
    addEvidence(scoreMap, signalMap, SENDER_CATEGORIES.NOTIFICATION, {
      strength: SIGNAL_STRENGTHS.SUPPORTING,
      type: "SYSTEM_HEADER_PRESENT",
    }, 1);
  }

  if (derived.recurring) {
    addEvidence(scoreMap, signalMap, SENDER_CATEGORIES.NOTIFICATION, {
      strength: SIGNAL_STRENGTHS.SUPPORTING,
      type: "RECURRING_SENDER_BEHAVIOR",
      value: messageCount,
    }, 1);
  }

  if (hasPattern(input, SENDER_CATEGORIES.TRANSACTIONAL)) {
    addEvidence(scoreMap, signalMap, SENDER_CATEGORIES.TRANSACTIONAL, {
      strength: SIGNAL_STRENGTHS.STRONG,
      type: "TRANSACTIONAL_ADDRESS_PATTERN",
    }, 2);
  }

  if (!derived.hasListIdSignal && derived.listUnsubscribeRatio === 0) {
    addEvidence(scoreMap, signalMap, SENDER_CATEGORIES.TRANSACTIONAL, {
      strength: SIGNAL_STRENGTHS.SUPPORTING,
      type: "DIRECT_MESSAGE_PATTERN",
      value: messageCount,
    }, 1);
  }

  if (hasPattern(input, SENDER_CATEGORIES.UPDATES)) {
    addEvidence(scoreMap, signalMap, SENDER_CATEGORIES.UPDATES, {
      strength: SIGNAL_STRENGTHS.STRONG,
      type: "UPDATES_ADDRESS_PATTERN",
    }, 2);
  }

  if (derived.recurring) {
    addEvidence(scoreMap, signalMap, SENDER_CATEGORIES.UPDATES, {
      strength: SIGNAL_STRENGTHS.SUPPORTING,
      type: "RECURRING_UPDATE_STREAM",
      value: messageCount,
    }, 1);
  }

  if (unsubscribeServiceDomainCount === 0 && derived.listIdRatio < CLASSIFICATION_THRESHOLDS.HEADER_RATIO_SUPPORTING) {
    addEvidence(scoreMap, signalMap, SENDER_CATEGORIES.UPDATES, {
      strength: SIGNAL_STRENGTHS.SUPPORTING,
      type: "LOW_MARKETING_INFRASTRUCTURE_SIGNAL",
    }, 1);
  }

  const rankedCategories = Object.values(SENDER_CATEGORIES)
    .filter((category) => category !== SENDER_CATEGORIES.UNKNOWN)
    .map((category) => ({
      category,
      score: scoreMap.get(category) || 0,
      signals: sortSignals(signalMap.get(category) || []),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return CATEGORY_PRECEDENCE.indexOf(left.category) - CATEGORY_PRECEDENCE.indexOf(right.category);
    });

  const topCandidate = rankedCategories[0];
  const secondCandidate = rankedCategories[1];

  if (!topCandidate || topCandidate.score < CLASSIFICATION_THRESHOLDS.MIN_CATEGORY_SCORE) {
    return {
      category: SENDER_CATEGORIES.UNKNOWN,
      classificationSignals: [{
        strength: SIGNAL_STRENGTHS.SUPPORTING,
        type: "INSUFFICIENT_CLASSIFICATION_EVIDENCE",
      }],
    };
  }

  if (
    secondCandidate &&
    secondCandidate.score >= CLASSIFICATION_THRESHOLDS.MIN_CATEGORY_SCORE &&
    topCandidate.score - secondCandidate.score <= 1 &&
    hasAmbiguousPair(topCandidate.category, secondCandidate.category)
  ) {
    return {
      category: SENDER_CATEGORIES.UNKNOWN,
      classificationSignals: sortSignals([
        {
          strength: SIGNAL_STRENGTHS.STRONG,
          type: "AMBIGUOUS_CATEGORY_EVIDENCE",
          value: [topCandidate.category, secondCandidate.category].sort(),
        },
        ...topCandidate.signals,
        ...secondCandidate.signals,
      ]),
    };
  }

  return {
    category: topCandidate.category,
    classificationSignals: topCandidate.signals,
  };
}

function deriveAttention(input) {
  const messageCount = input.messageCount || 0;
  const unreadRatio = ratio(input.unreadCount || 0, messageCount);
  const trashRatio = ratio(input.trashCount || 0, messageCount);
  const attentionSignals = [];

  if (
    messageCount >= CLASSIFICATION_THRESHOLDS.ATTENTION_MEDIUM_MESSAGE_COUNT &&
    unreadRatio >= CLASSIFICATION_THRESHOLDS.ATTENTION_HIGH_UNREAD_RATIO
  ) {
    attentionSignals.push({
      strength: SIGNAL_STRENGTHS.STRONG,
      type: "HIGH_UNREAD_RATIO",
      value: unreadRatio,
    });
  }

  if (
    messageCount >= CLASSIFICATION_THRESHOLDS.ATTENTION_MEDIUM_MESSAGE_COUNT &&
    trashRatio >= CLASSIFICATION_THRESHOLDS.ATTENTION_HIGH_TRASH_RATIO
  ) {
    attentionSignals.push({
      strength: SIGNAL_STRENGTHS.STRONG,
      type: "HIGH_TRASH_RATIO",
      value: trashRatio,
    });
  }

  if (messageCount >= CLASSIFICATION_THRESHOLDS.ATTENTION_HIGH_MESSAGE_COUNT) {
    attentionSignals.push({
      strength: SIGNAL_STRENGTHS.SUPPORTING,
      type: "HIGH_MESSAGE_VOLUME",
      value: messageCount,
    });
  } else if (messageCount >= CLASSIFICATION_THRESHOLDS.ATTENTION_MEDIUM_MESSAGE_COUNT) {
    attentionSignals.push({
      strength: SIGNAL_STRENGTHS.SUPPORTING,
      type: "MEDIUM_MESSAGE_VOLUME",
      value: messageCount,
    });
  }

  if (
    attentionSignals.some((signal) => signal.type === "HIGH_UNREAD_RATIO") ||
    attentionSignals.some((signal) => signal.type === "HIGH_TRASH_RATIO")
  ) {
    return {
      attention: ATTENTION_LEVELS.HIGH,
      attentionSignals: sortSignals(attentionSignals),
    };
  }

  if (
    messageCount >= CLASSIFICATION_THRESHOLDS.ATTENTION_MEDIUM_MESSAGE_COUNT &&
    (unreadRatio >= CLASSIFICATION_THRESHOLDS.ATTENTION_MEDIUM_UNREAD_RATIO ||
      trashRatio >= CLASSIFICATION_THRESHOLDS.ATTENTION_MEDIUM_TRASH_RATIO ||
      messageCount >= CLASSIFICATION_THRESHOLDS.ATTENTION_HIGH_MESSAGE_COUNT)
  ) {
    return {
      attention: ATTENTION_LEVELS.MEDIUM,
      attentionSignals: sortSignals(attentionSignals),
    };
  }

  return {
    attention: ATTENTION_LEVELS.LOW,
    attentionSignals: sortSignals(attentionSignals),
  };
}

export function classifySenderGroup(input) {
  const categoryResult = classifyCategory(input);
  const attentionResult = deriveAttention(input);

  return {
    attention: attentionResult.attention,
    attentionSignals: attentionResult.attentionSignals,
    category: categoryResult.category,
    classificationSignals: categoryResult.classificationSignals,
  };
}