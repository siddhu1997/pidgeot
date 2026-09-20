const CATEGORY_META = {
  NEWSLETTER: {
    color: "#f4c95d",
    label: "Newsletter",
  },
  NOTIFICATION: {
    color: "#38bdf8",
    label: "Notification",
  },
  PROMOTIONAL: {
    color: "#fb7185",
    label: "Promotional",
  },
  SOCIAL: {
    color: "#c084fc",
    label: "Social",
  },
  TRANSACTIONAL: {
    color: "#2dd4bf",
    label: "Transactional",
  },
  UPDATES: {
    color: "#94a3b8",
    label: "Updates",
  },
};

const SENDER_PREFIXES = [
  "Beacon",
  "Cardinal",
  "Parcel",
  "Orbit",
  "Echo",
  "Harbor",
  "Kite",
  "Mint",
  "North",
  "Olive",
  "Pixel",
  "Quartz",
  "Ribbon",
  "Signal",
  "Tandem",
  "Velvet",
];

const SENDER_SUFFIXES = [
  "Weekly",
  "Club",
  "Dispatch",
  "Ledger",
  "Alerts",
  "Studio",
  "Collective",
  "Bulletin",
  "Digest",
  "Lab",
  "Brief",
  "Notes",
  "List",
  "Journal",
  "Feed",
  "Board",
];

export const DEFAULT_PLAYGROUND_CONTROLS = {
  messages: 4821,
  newsletters: 31,
  notifications: 14,
  promotional: 18,
  seed: 17,
  senders: 73,
  unsubscribeAvailable: 27,
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function createSeededRandom(seed) {
  let current = seed >>> 0;

  return () => {
    current += 0x6d2b79f5;
    let next = current;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(items, random) {
  const nextItems = [...items];

  for (let index = nextItems.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [nextItems[index], nextItems[swapIndex]] = [nextItems[swapIndex], nextItems[index]];
  }

  return nextItems;
}

function distributeIntegerTotal(total, weights) {
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  const rawAllocations = weights.map((weight) => (weight / weightSum) * total);
  const baseAllocations = rawAllocations.map((value) => Math.floor(value));
  let remainder = total - baseAllocations.reduce((sum, value) => sum + value, 0);
  const ranking = rawAllocations
    .map((value, index) => ({
      fraction: value - baseAllocations[index],
      index,
    }))
    .sort((left, right) => right.fraction - left.fraction);

  for (let index = 0; index < ranking.length && remainder > 0; index += 1) {
    baseAllocations[ranking[index].index] += 1;
    remainder -= 1;
  }

  return baseAllocations;
}

function buildCategorySequence({ notifications, promotional, newsletters, random, senders }) {
  const boundedNewsletters = clamp(newsletters, 0, senders);
  const boundedPromotional = clamp(promotional, 0, Math.max(0, senders - boundedNewsletters));
  const boundedNotifications = clamp(
    notifications,
    0,
    Math.max(0, senders - boundedNewsletters - boundedPromotional),
  );
  const remaining = Math.max(0, senders - boundedNewsletters - boundedPromotional - boundedNotifications);
  const categories = [
    ...Array.from({ length: boundedNewsletters }, () => "NEWSLETTER"),
    ...Array.from({ length: boundedPromotional }, () => "PROMOTIONAL"),
    ...Array.from({ length: boundedNotifications }, () => "NOTIFICATION"),
  ];

  for (let index = 0; index < remaining; index += 1) {
    categories.push(["UPDATES", "TRANSACTIONAL", "SOCIAL"][index % 3]);
  }

  return shuffle(categories, random);
}

function createSenderLabel(index) {
  const prefix = SENDER_PREFIXES[index % SENDER_PREFIXES.length];
  const suffix = SENDER_SUFFIXES[Math.floor(index / SENDER_PREFIXES.length) % SENDER_SUFFIXES.length];

  return `${prefix} ${suffix}`;
}

function createDomain(label) {
  return `${label.toLowerCase().replace(/\s+/g, "-")}.mail`;
}

function getCategoryWeight(category, random) {
  const baseWeights = {
    NEWSLETTER: 1.35,
    NOTIFICATION: 0.9,
    PROMOTIONAL: 1.15,
    SOCIAL: 0.7,
    TRANSACTIONAL: 0.65,
    UPDATES: 0.8,
  };

  return baseWeights[category] + random() * 0.8;
}

function buildVisibleMessages({ groups, random }) {
  const sourceGroups = groups.slice(0, Math.min(10, groups.length));
  const visibleCount = Math.min(108, Math.max(48, sourceGroups.length * 9));
  const weights = sourceGroups.map((group) => group.messageCount);
  const allocations = distributeIntegerTotal(visibleCount, weights);
  const laneAnchors = sourceGroups.map((group, index) => ({
    groupId: group.id,
    x: 12 + (index % 5) * 17,
    y: 18 + Math.floor(index / 5) * 36,
  }));
  const messages = [];

  sourceGroups.forEach((group, groupIndex) => {
    const cluster = laneAnchors[groupIndex];

    for (let index = 0; index < allocations[groupIndex]; index += 1) {
      messages.push({
        color: group.color,
        groupId: group.id,
        id: `${group.id}-m-${index}`,
        clusterX: clamp(cluster.x + (random() - 0.5) * 12, 6, 94),
        clusterY: clamp(cluster.y + (random() - 0.5) * 14, 8, 92),
        chaosX: 8 + random() * 84,
        chaosY: 10 + random() * 82,
        depth: random() * 2 - 1,
        size: 8 + random() * 10,
      });
    }
  });

  return messages;
}

function buildGroups({ messages, random, senders, unsubscribeAvailable, categories }) {
  const weights = categories.map((category) => getCategoryWeight(category, random));
  const messageCounts = distributeIntegerTotal(messages, weights);
  const rankedGroupIndexes = messageCounts
    .map((messageCount, index) => ({ index, messageCount }))
    .sort((left, right) => right.messageCount - left.messageCount)
    .map((item) => item.index);
  const unsubscribeIndexSet = new Set(rankedGroupIndexes.slice(0, clamp(unsubscribeAvailable, 0, senders)));

  return messageCounts.map((messageCount, index) => {
    const category = categories[index];
    const label = createSenderLabel(index);
    const unreadRatioByCategory = {
      NEWSLETTER: 0.38,
      NOTIFICATION: 0.52,
      PROMOTIONAL: 0.31,
      SOCIAL: 0.27,
      TRANSACTIONAL: 0.12,
      UPDATES: 0.22,
    };
    const trashRatioByCategory = {
      NEWSLETTER: 0.24,
      NOTIFICATION: 0.06,
      PROMOTIONAL: 0.18,
      SOCIAL: 0.05,
      TRANSACTIONAL: 0.02,
      UPDATES: 0.08,
    };
    const unread = Math.min(messageCount, Math.round(messageCount * (unreadRatioByCategory[category] + random() * 0.12)));
    const trash = Math.min(messageCount - unread, Math.round(messageCount * (trashRatioByCategory[category] + random() * 0.1)));
    const hasUnsubscribe = unsubscribeIndexSet.has(index);
    const reasoningSignals = {
      listId: category === "NEWSLETTER" || category === "PROMOTIONAL",
      listUnsubscribe: hasUnsubscribe,
      precedenceBulk: category === "NEWSLETTER" || category === "PROMOTIONAL" || category === "NOTIFICATION",
      promotionalPattern: category === "PROMOTIONAL" || category === "NEWSLETTER",
      transactionalPattern: category === "TRANSACTIONAL",
    };
    const signalScore = Object.values(reasoningSignals).filter(Boolean).length;
    const attention = unread > trash + Math.round(messageCount * 0.15)
      ? "HIGH"
      : unread > Math.round(messageCount * 0.16)
        ? "MEDIUM"
        : "LOW";

    return {
      attention,
      category,
      color: CATEGORY_META[category].color,
      domain: createDomain(label),
      id: `sg_${index + 1}`,
      label,
      messageCount,
      signalScore,
      trash,
      unread,
      unsubscribeAvailable: hasUnsubscribe,
      reasoningSignals,
      whySummary: hasUnsubscribe
        ? `${CATEGORY_META[category].label} patterns plus unsubscribe infrastructure make this cluster actionable.`
        : `${CATEGORY_META[category].label} patterns are visible, but no automatic unsubscribe path is present in the synthetic input.`,
    };
  });
}

export function createPlaygroundDataset(input = {}) {
  const controls = {
    ...DEFAULT_PLAYGROUND_CONTROLS,
    ...input,
  };
  const normalizedControls = {
    messages: clamp(Number(controls.messages) || DEFAULT_PLAYGROUND_CONTROLS.messages, 500, 10000),
    newsletters: clamp(Number(controls.newsletters) || DEFAULT_PLAYGROUND_CONTROLS.newsletters, 1, 80),
    notifications: clamp(Number(controls.notifications) || DEFAULT_PLAYGROUND_CONTROLS.notifications, 1, 60),
    promotional: clamp(Number(controls.promotional) || DEFAULT_PLAYGROUND_CONTROLS.promotional, 1, 60),
    seed: clamp(Number(controls.seed) || DEFAULT_PLAYGROUND_CONTROLS.seed, 1, 999),
    senders: clamp(Number(controls.senders) || DEFAULT_PLAYGROUND_CONTROLS.senders, 8, 120),
    unsubscribeAvailable: clamp(
      Number(controls.unsubscribeAvailable) || DEFAULT_PLAYGROUND_CONTROLS.unsubscribeAvailable,
      1,
      80,
    ),
  };
  const random = createSeededRandom(normalizedControls.seed);
  const categories = buildCategorySequence({
    newsletters: normalizedControls.newsletters,
    notifications: normalizedControls.notifications,
    promotional: normalizedControls.promotional,
    random,
    senders: normalizedControls.senders,
  });
  const groups = buildGroups({
    categories,
    messages: normalizedControls.messages,
    random,
    senders: normalizedControls.senders,
    unsubscribeAvailable: normalizedControls.unsubscribeAvailable,
  }).sort((left, right) => right.messageCount - left.messageCount);
  const featuredGroups = groups.slice(0, Math.min(10, groups.length));
  const whyGroup = featuredGroups[(normalizedControls.seed + featuredGroups.length) % featuredGroups.length];
  const visibleMessages = buildVisibleMessages({
    groups: featuredGroups,
    random,
  });

  return {
    controls: normalizedControls,
    featuredGroups,
    groups,
    ritualStages: ["CHAOS", "DISCOVERY", "GROUPING", "STRUCTURE", "READY"],
    summary: {
      messages: normalizedControls.messages,
      newsletters: normalizedControls.newsletters,
      notifications: normalizedControls.notifications,
      promotional: normalizedControls.promotional,
      senders: normalizedControls.senders,
      unsubscribeAvailable: normalizedControls.unsubscribeAvailable,
    },
    visibleMessages,
    whyGroup,
  };
}