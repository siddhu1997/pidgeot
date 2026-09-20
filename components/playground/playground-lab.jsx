"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";

import {
  createPlaygroundDataset,
  DEFAULT_PLAYGROUND_CONTROLS,
} from "@/lib/playground/synthetic-data";

const EXPERIMENTS = [
  {
    id: "machine",
    shortLabel: "Machine",
    title: "Watch Pidgeot discover who belongs together.",
    description: "Incoming messages arrive, the lens examines them, and sender groups emerge and grow.",
  },
  {
    id: "scan",
    shortLabel: "Scan",
    title: "Watch Pidgeot work through your inbox.",
    description: "Representative batches move through the scanner, and completed work becomes discovered structure.",
  },
  {
    id: "decision",
    shortLabel: "Decision",
    title: "See which senders deserve action.",
    description: "The groups Pidgeot discovered settle into a calmer surface where you choose what to act on.",
  },
  {
    id: "cleanup",
    shortLabel: "Cleanup",
    title: "Watch selected work move through cleanup.",
    description: "Selected sender groups enter a cleanup machine, split into truthful actions, and settle into completed work.",
  },
  {
    id: "reference",
    shortLabel: "Reference",
    title: "Study how Pidgeot objects should move.",
    description: "A disposable motion sketchbook for gathering, sweeping, depositing, feeding, severing, and settling.",
  },
  {
    id: "motion",
    shortLabel: "Cards",
    title: "Watch inbox piles reorganise.",
    description: "Choose a sorting rule and the sender cards physically settle into a new order.",
  },
  {
    id: "clusters",
    shortLabel: "Clusters",
    title: "Watch chaos become structure.",
    description: "Start with scattered messages, then pull them into visible sender groups.",
  },
];

const MESSAGE_SUBJECTS = [
  "Weekly digest",
  "Shipping update",
  "Price drop",
  "New activity",
  "Your receipt",
  "Team notes",
  "Event reminder",
  "Feature roundup",
  "Billing heads-up",
  "Account summary",
  "Monthly highlights",
  "Check this out",
  "Delivery update",
  "Account notice",
  "Renewal reminder",
  "Security alert",
  "Order update",
  "Member benefits",
];

const MACHINE_SEQUENCE = [
  { sender: "Beacon Club", subject: "Weekly digest", unread: true },
  { sender: "Amazon", subject: "Order update", unread: false },
  { sender: "Beacon Club", subject: "Price drop", unread: true },
  { sender: "Uber", subject: "Your receipt", unread: false },
  { sender: "Amazon", subject: "Delivery update", unread: true },
  { sender: "Kite Dispatch", subject: "Feature roundup", unread: true },
  { sender: "New Sender", subject: "Account notice", unread: true },
  { sender: "Beacon Club", subject: "Member benefits", unread: true },
  { sender: "Uber", subject: "Monthly highlights", unread: false },
  { sender: "New Sender", subject: "Security alert", unread: true },
  { sender: "Kite Dispatch", subject: "Renewal reminder", unread: true },
  { sender: "Amazon", subject: "Shipping update", unread: false },
];

const MACHINE_SIGNAL_COPY = {
  "Beacon Club": ["LIST-ID", "BULK", "UNSUBSCRIBE"],
  Amazon: ["ORDER", "RECURRING", "TRANSACTIONAL"],
  Uber: ["RECEIPT", "RECURRING", "TRANSACTIONAL"],
  "Kite Dispatch": ["LIST-ID", "RECURRING", "UNSUBSCRIBE"],
  "New Sender": ["NOTICE", "RECURRING", "UNREAD"],
};

const MACHINE_PHASES = [
  { id: "queue", duration: 560 },
  { id: "inspect", duration: 1080 },
  { id: "recognize", duration: 520 },
  { id: "travel", duration: 1220 },
  { id: "land", duration: 620 },
  { id: "pause", duration: 580 },
];

const SCAN_RITUAL_PHASES = [
  { id: "arrive", duration: 720 },
  { id: "inspect", duration: 1040 },
  { id: "transfer", duration: 920 },
  { id: "settle", duration: 540 },
];

const MACHINE_VISIBLE_DESTINATION_LIMIT = 4;
const SCAN_VISIBLE_DISCOVERY_LIMIT = 7;

const MACHINE_ATTRIBUTE_STEPS = {
  "Beacon Club": [
    { at: 3, label: "NEWSLETTER" },
    { at: 8, label: "ONE-CLICK UNSUBSCRIBE" },
  ],
  Amazon: [
    { at: 5, label: "TRANSACTIONAL" },
  ],
  Uber: [
    { at: 9, label: "TRANSACTIONAL" },
  ],
  "Kite Dispatch": [
    { at: 6, label: "UPDATES" },
    { at: 11, label: "ONE-CLICK UNSUBSCRIBE" },
  ],
  "New Sender": [
    { at: 10, label: "ACTIONABLE" },
  ],
};

const CATEGORY_LABELS = {
  NEWSLETTER: "Newsletter",
  NOTIFICATION: "Notification",
  PROMOTIONAL: "Promotional",
  SOCIAL: "Social",
  TRANSACTIONAL: "Transactional",
  UPDATES: "Updates",
};

const DECISION_SETTLE_DELAY_MS = 900;
const CLEANUP_VARIANTS = {
  complete: "All complete",
  partial: "Partial completion",
};
const CLEANUP_STUDIES = [
  { id: "broom", label: "Broom" },
  { id: "trash", label: "Trash can" },
  { id: "shredder", label: "Shredder" },
  { id: "unsubscribe", label: "Unsubscribe" },
];
const REFERENCE_STUDIES = [
  { id: "gather", frameCount: 4, frameDuration: 540, title: "Gather" },
  { id: "sweep", frameCount: 4, frameDuration: 560, title: "Sweep" },
  { id: "deposit", frameCount: 5, frameDuration: 460, title: "Deposit" },
  { id: "feed", frameCount: 5, frameDuration: 480, title: "Feed" },
  { id: "sever", frameCount: 4, frameDuration: 620, title: "Sever" },
  { id: "settle", frameCount: 4, frameDuration: 560, title: "Settle" },
];

function classNames(...items) {
  return items.filter(Boolean).join(" ");
}

function formatLabel(label) {
  return label.replace(/([A-Z])/g, " $1").replace(/^./, (character) => character.toUpperCase());
}

function getExperimentById(id) {
  return EXPERIMENTS.find((experiment) => experiment.id === id) || EXPERIMENTS[0];
}

function StageShell({ title, description, children, footer }) {
  return (
    <section className="relative overflow-hidden rounded-[36px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,15,28,0.9),rgba(3,7,16,0.98))] px-4 py-5 shadow-[0_30px_90px_rgba(0,0,0,0.36)] md:px-6 md:py-6 lg:px-8 lg:py-7">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_12%,rgba(56,189,248,0.14),transparent_22%),radial-gradient(circle_at_84%_10%,rgba(244,201,93,0.12),transparent_18%),radial-gradient(circle_at_50%_100%,rgba(255,255,255,0.05),transparent_24%)]" />
      <div className="relative">
        <header className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <h2 className="text-3xl font-semibold tracking-[-0.05em] text-white sm:text-4xl">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300 sm:text-base">{description}</p>
          </div>
          {footer ? <div className="flex flex-wrap gap-2">{footer}</div> : null}
        </header>
        {children}
      </div>
    </section>
  );
}

function CompactStat({ label, value }) {
  return (
    <div className="rounded-full border border-white/10 bg-white/5 px-3 py-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</span>
      <span className="ml-2 text-sm font-semibold text-white">{value}</span>
    </div>
  );
}

function buildSemanticMessages(dataset, limit = 12) {
  const groupMap = new Map(dataset.featuredGroups.map((group) => [group.id, group]));

  return dataset.visibleMessages.slice(0, limit).map((message, index) => {
    const group = groupMap.get(message.groupId) || dataset.featuredGroups[0];

    return {
      color: group.color,
      group,
      id: `${message.id}-semantic`,
      preview: MESSAGE_SUBJECTS[index % MESSAGE_SUBJECTS.length],
      unread: index % 3 !== 0,
    };
  });
}

function buildMachineMessages(dataset) {
  const groupByLabel = new Map(dataset.groups.map((group) => [group.label, group]));

  return MACHINE_SEQUENCE.map((item, index) => {
    const fallbackGroup = dataset.featuredGroups[index % dataset.featuredGroups.length];
    const group = groupByLabel.get(item.sender) || fallbackGroup;

    return {
      color: group.color,
      group,
      id: `machine-${index + 1}`,
      preview: item.subject,
      unread: item.unread,
    };
  });
}

function buildMachineGroupState(machineMessages, landedCount) {
  return machineMessages.reduce((map, message, index) => {
    if (index >= landedCount) {
      return map;
    }

    const existing = map.get(message.group.label) || {
      attributes: [],
      count: 0,
      discoveredAt: index,
      group: message.group,
    };
    const attributeSteps = MACHINE_ATTRIBUTE_STEPS[message.group.label] || [];

    attributeSteps.forEach((step) => {
      if (index + 1 >= step.at && !existing.attributes.includes(step.label)) {
        existing.attributes.push(step.label);
      }
    });

    existing.count += 1;
    map.set(message.group.label, existing);

    return map;
  }, new Map());
}

function buildMachineOrder(machineMessages) {
  return machineMessages.reduce((labels, message) => {
    if (!labels.includes(message.group.label)) {
      labels.push(message.group.label);
    }

    return labels;
  }, []);
}

function buildVisibleDestinationEntries(entries, activeLabel, limit = MACHINE_VISIBLE_DESTINATION_LIMIT) {
  if (entries.length <= limit) {
    return {
      hiddenCount: 0,
      visibleEntries: entries,
    };
  }

  const fallbackVisibleEntries = entries.slice(-limit);

  if (!activeLabel || fallbackVisibleEntries.some((entry) => entry.group.label === activeLabel)) {
    return {
      hiddenCount: entries.length - fallbackVisibleEntries.length,
      visibleEntries: fallbackVisibleEntries,
    };
  }

  const activeEntry = entries.find((entry) => entry.group.label === activeLabel);

  if (!activeEntry) {
    return {
      hiddenCount: entries.length - fallbackVisibleEntries.length,
      visibleEntries: fallbackVisibleEntries,
    };
  }

  const recentEntries = entries
    .filter((entry) => entry.group.label !== activeLabel)
    .slice(-(limit - 1));
  const visibleEntries = [...recentEntries, activeEntry];
  const orderMap = new Map(entries.map((entry, index) => [entry.group.label, index]));

  visibleEntries.sort((left, right) => (orderMap.get(left.group.label) || 0) - (orderMap.get(right.group.label) || 0));

  return {
    hiddenCount: entries.length - visibleEntries.length,
    visibleEntries,
  };
}

function distributeLocalTotal(total, weights) {
  const safeWeights = weights.length ? weights : [1];
  const weightSum = safeWeights.reduce((sum, weight) => sum + weight, 0) || 1;
  const rawAllocations = safeWeights.map((weight) => (weight / weightSum) * total);
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

function buildScanBatches(dataset) {
  const scanMessages = buildSemanticMessages(dataset, 36);
  const batchWeights = [1.12, 1.22, 1.04, 0.96, 0.9];
  const batchCount = Math.min(batchWeights.length, Math.max(4, Math.ceil(scanMessages.length / 7)));
  const weights = batchWeights.slice(0, batchCount);
  const cardAllocations = distributeLocalTotal(scanMessages.length, weights);
  const messageGains = distributeLocalTotal(dataset.summary.messages, weights);
  const senderGains = distributeLocalTotal(dataset.summary.senders, weights);
  const unsubscribeGains = distributeLocalTotal(dataset.summary.unsubscribeAvailable, weights);
  let cursor = 0;

  return Array.from({ length: batchCount }, (_, index) => {
    const cards = scanMessages.slice(cursor, cursor + cardAllocations[index]);
    cursor += cardAllocations[index];
    const discoveredGroups = Array.from(new Map(cards.map((card) => [card.group.id, card.group])).values()).slice(0, 4);
    const pathGroups = discoveredGroups.filter((group) => group.unsubscribeAvailable).slice(0, 3);

    return {
      cards,
      discoveredGroups,
      id: `scan-batch-${index + 1}`,
      label: `Batch ${index + 1}`,
      messageGain: messageGains[index],
      senderGain: senderGains[index],
      unsubscribeGain: unsubscribeGains[index],
      unsubscribeGroups: pathGroups,
      visibleCount: cards.length,
    };
  });
}

function summarizeScanProgress(batches, completedBatchCount) {
  const completedBatches = batches.slice(0, completedBatchCount);
  const discoveredMessages = completedBatches.reduce((sum, batch) => sum + batch.messageGain, 0);
  const discoveredSenders = completedBatches.reduce((sum, batch) => sum + batch.senderGain, 0);
  const unsubscribePaths = completedBatches.reduce((sum, batch) => sum + batch.unsubscribeGain, 0);
  const discoveredGroups = [];
  const discoveredGroupIds = new Set();
  const discoveredPathLabels = [];

  completedBatches.forEach((batch) => {
    batch.discoveredGroups.forEach((group) => {
      if (!discoveredGroupIds.has(group.id)) {
        discoveredGroupIds.add(group.id);
        discoveredGroups.push(group);
      }
    });

    batch.unsubscribeGroups.forEach((group) => {
      if (!discoveredPathLabels.includes(group.label)) {
        discoveredPathLabels.push(group.label);
      }
    });
  });

  return {
    discoveredGroups,
    discoveredMessages,
    discoveredSenders,
    discoveredPathLabels,
    unsubscribePaths,
  };
}

function buildCleanupScenario(dataset, variant = "partial") {
  const candidates = buildDecisionGroups(dataset);
  const selected = [];
  const usedIds = new Set();

  function takeMatch(predicate) {
    const group = candidates.find((entry) => predicate(entry) && !usedIds.has(entry.id));

    if (!group) {
      return null;
    }

    usedIds.add(group.id);
    selected.push(group);

    return group;
  }

  if (variant === "partial") {
    takeMatch((entry) => entry.mechanism.mode === "one-click" && entry.unread > 0);
    takeMatch((entry) => entry.mechanism.mode === "one-click" && entry.unread > 0);
    takeMatch((entry) => entry.mechanism.tone === "manual" && entry.unread > 0);
    takeMatch((entry) => entry.mechanism.mode === "unavailable" && entry.unread > 0);
  } else {
    takeMatch((entry) => entry.mechanism.mode === "one-click" && entry.unread > 0);
    takeMatch((entry) => entry.mechanism.mode === "one-click" && entry.unread > 0);
    takeMatch((entry) => entry.mechanism.mode === "one-click" && entry.unread > 0);
    takeMatch((entry) => entry.unread > 0);
  }

  candidates.forEach((entry) => {
    if (selected.length < 4 && !usedIds.has(entry.id)) {
      usedIds.add(entry.id);
      selected.push(entry);
    }
  });

  const senders = selected.slice(0, 4).map((entry) => ({
    ...entry,
    cleanupAction: entry.mechanism.mode === "one-click"
      ? "auto"
      : entry.mechanism.tone === "manual"
        ? "manual"
        : "none",
    actionChip: entry.mechanism.mode === "one-click"
      ? "AUTO UNSUBSCRIBE"
      : entry.mechanism.tone === "manual"
        ? "MANUAL REVIEW"
        : "NO UNSUBSCRIBE",
    trashAmount: entry.unread,
  }));

  return {
    senders,
    totals: {
      auto: senders.filter((sender) => sender.cleanupAction === "auto").length,
      manual: senders.filter((sender) => sender.cleanupAction === "manual").length,
      none: senders.filter((sender) => sender.cleanupAction === "none").length,
      unread: senders.reduce((sum, sender) => sum + sender.trashAmount, 0),
    },
    variant,
  };
}

function buildCleanupCards(senders) {
  return senders.flatMap((sender) => {
    const cardCount = Math.max(3, Math.min(8, Math.ceil(sender.trashAmount / 12)));
    const baseUnits = Math.max(1, Math.floor(sender.trashAmount / cardCount));
    const remainder = sender.trashAmount - (baseUnits * cardCount);

    return Array.from({ length: cardCount }, (_, index) => ({
      cleanupAction: sender.cleanupAction,
      color: sender.color,
      id: `${sender.id}-cleanup-card-${index + 1}`,
      label: sender.label,
      unreadUnits: baseUnits + (index < remainder ? 1 : 0),
    }));
  });
}

function distributeCleanupCards(cards) {
  return cards.map((card, index) => {
    const column = index % 4;
    const row = Math.floor(index / 4);

    return {
      ...card,
      baseX: 24 + (column * 18) + ((row + column) % 2 === 0 ? -3 : 3),
      baseY: 24 + (row * 16) + (column % 2 === 0 ? 5 : -1),
      bunchX: 48 + ((index % 3) * 5),
      bunchY: 28 + (Math.floor(index / 3) * 6),
      fallX: 72 + ((column % 2) * 5),
      fallY: 76 + ((index % 3) * 4),
      rotation: ((index % 5) - 2) * 3,
      shredX: 72 + ((row % 2) * 4),
      shredY: 34 + ((column % 3) * 5),
      sweepX: 84 + ((row % 2) * 4),
      sweepY: 44 + ((column % 2) * 6),
    };
  });
}

function getCleanupCardStyle(studyId, card, active) {
  if (!active) {
    return {
      opacity: 1,
      rotate: card.rotation,
      scale: 1,
      x: `${card.baseX}%`,
      y: `${card.baseY}%`,
    };
  }

  if (studyId === "broom") {
    return {
      opacity: 0,
      rotate: 0,
      scale: 0.72,
      x: `${card.sweepX}%`,
      y: `${card.sweepY}%`,
    };
  }

  if (studyId === "trash") {
    return {
      opacity: 0,
      rotate: 10,
      scale: 0.68,
      x: `${card.fallX}%`,
      y: `${card.fallY}%`,
    };
  }

  if (studyId === "shredder") {
    return {
      opacity: 0,
      rotate: 0,
      scale: 0.22,
      x: `${card.shredX}%`,
      y: `${card.shredY}%`,
    };
  }

  return {
    opacity: 0.2,
    rotate: 0,
    scale: 0.92,
    x: `${card.baseX}%`,
    y: `${card.baseY}%`,
  };
}

function CleanupClutterCard({ card, reducedMotion, studyId, active }) {
  const animatedStyle = getCleanupCardStyle(studyId, card, active);

  return (
    <motion.div
      aria-hidden="true"
      className="absolute h-20 w-28 rounded-[18px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.1),rgba(255,255,255,0.03))] p-3 shadow-[0_16px_34px_rgba(0,0,0,0.22)]"
      initial={false}
      animate={animatedStyle}
      transition={reducedMotion ? { duration: 0 } : { duration: 0.72, ease: [0.22, 1, 0.36, 1] }}
      style={{ borderColor: `${card.color}2d` }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-semibold text-white">{card.label}</span>
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: card.color }} />
      </div>
      <div className="mt-3 h-1.5 rounded-full bg-white/10" />
      <div className="mt-2 h-1.5 w-4/5 rounded-full bg-white/6" />
    </motion.div>
  );
}

function CleanupSweepGlyph({ reducedMotion, running }) {
  return (
    <motion.div
      aria-hidden="true"
      className="absolute left-[6%] top-[62%] h-12 w-40 origin-left"
      animate={reducedMotion
        ? { opacity: 0.9, rotate: -10, x: 0 }
        : running
          ? { opacity: [0.7, 1, 0.9], rotate: [-10, -4, 8], x: [0, 74, 112] }
          : { opacity: 0.62, rotate: -10, x: 0 }}
      transition={reducedMotion ? { duration: 0 } : { duration: 1.05, ease: "easeInOut" }}
    >
      <div className="absolute left-0 top-4 h-1 w-28 rounded-full bg-[rgba(244,201,93,0.6)]" />
      <div className="absolute right-0 top-0 h-10 w-14 rounded-[16px] border border-[#f4c95d]/24 bg-[rgba(244,201,93,0.12)]" />
      <div className="absolute right-2 top-7 h-4 w-10 rounded-b-[16px] border-x border-b border-white/12 bg-white/6" />
    </motion.div>
  );
}

function CleanupTrashCan({ reducedMotion, active }) {
  return (
    <motion.div
      aria-hidden="true"
      className="absolute bottom-[8%] right-[8%] h-28 w-24"
      animate={reducedMotion
        ? { scale: 1, y: 0 }
        : active
          ? { scale: [1, 1.03, 1], y: [0, -2, 0] }
          : { scale: 1, y: 0 }}
      transition={reducedMotion ? { duration: 0 } : { duration: 0.44, ease: "easeOut" }}
    >
      <div className="mx-auto mb-1 h-3 w-20 rounded-full border border-white/10 bg-white/8" />
      <div className="mx-auto h-24 w-18 rounded-b-[20px] border border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.1),rgba(255,255,255,0.03))]" />
    </motion.div>
  );
}

function CleanupShredder({ reducedMotion, active }) {
  return (
    <motion.div
      aria-hidden="true"
      className="absolute right-[6%] top-[22%] h-32 w-32 rounded-[26px] border border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-4"
      animate={reducedMotion
        ? { boxShadow: "0 16px 34px rgba(0,0,0,0.2)" }
        : active
          ? { boxShadow: ["0 16px 34px rgba(0,0,0,0.2)", "0 18px 46px rgba(244,201,93,0.08)", "0 16px 34px rgba(0,0,0,0.2)"] }
          : { boxShadow: "0 16px 34px rgba(0,0,0,0.2)" }}
      transition={reducedMotion ? { duration: 0 } : { duration: 0.5, ease: "easeInOut" }}
    >
      <div className="mx-auto mt-2 h-3 w-20 rounded-full border border-[#f4c95d]/18 bg-[#f4c95d]/8" />
      <div className="mt-5 grid gap-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <motion.div
            key={`shred-strip-${index}`}
            className="h-2 rounded-full bg-white/10"
            animate={reducedMotion
              ? { opacity: 0.8 }
              : active
                ? { opacity: [0.5, 1, 0.5], x: [0, 4, 0] }
                : { opacity: 0.7, x: 0 }}
            transition={reducedMotion ? { duration: 0 } : { duration: 0.42, delay: index * 0.03, repeat: active ? 2 : 0 }}
          />
        ))}
      </div>
    </motion.div>
  );
}

function CleanupUnsubscribeStudy({ senders, reducedMotion, running, complete }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {senders.map((sender, index) => {
        const relationshipRemoved = complete || reducedMotion || (running && sender.cleanupAction !== "none");

        return (
          <div key={sender.id} className="rounded-[24px] border border-white/10 bg-[rgba(255,255,255,0.03)] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">{sender.label}</p>
                <p className="mt-1 text-xs text-slate-400">{sender.messageCount} messages</p>
              </div>
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: sender.color }} />
            </div>

            <div className="relative mt-5 h-24 overflow-hidden rounded-[18px] border border-white/8 bg-black/18">
              <div className="absolute left-4 top-8 h-8 w-8 rounded-full border border-white/10 bg-white/6" />
              <div className="absolute right-4 top-8 h-8 w-8 rounded-full border border-white/10 bg-white/6" />
              <motion.div
                aria-hidden="true"
                className={classNames(
                  "absolute left-[26%] top-[48%] h-[2px] origin-left",
                  sender.cleanupAction === "none" ? "bg-white/10" : sender.cleanupAction === "manual" ? "bg-cyan-300/70" : "bg-[#f4c95d]/72",
                )}
                animate={reducedMotion
                  ? { opacity: sender.cleanupAction === "none" ? 0.28 : 0.08, scaleX: sender.cleanupAction === "none" ? 1 : 0.22 }
                  : sender.cleanupAction === "none"
                    ? { opacity: 0.34, scaleX: 1 }
                    : running
                      ? { opacity: [1, 0.08], scaleX: [1, 0.1] }
                      : { opacity: 1, scaleX: 1 }}
                transition={reducedMotion ? { duration: 0 } : { duration: 0.7, delay: index * 0.1, ease: "easeInOut" }}
                style={{ width: "48%" }}
              />
              {sender.cleanupAction !== "none" ? (
                <motion.div
                  aria-hidden="true"
                  className={classNames(
                    "absolute left-[46%] top-[40%] rounded-full border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em]",
                    sender.cleanupAction === "manual"
                      ? "border-cyan-300/24 bg-cyan-300/12 text-cyan-100"
                      : "border-[#f4c95d]/24 bg-[#f4c95d]/12 text-[#fbe9b2]",
                  )}
                  animate={reducedMotion
                    ? { opacity: 1, y: 0 }
                    : running
                      ? { opacity: [1, 1, 0], y: [0, -6, -20] }
                      : { opacity: 1, y: 0 }}
                  transition={reducedMotion ? { duration: 0 } : { duration: 0.76, delay: index * 0.08, ease: "easeInOut" }}
                >
                  unsubscribe
                </motion.div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function getDecisionUnsubscribeMechanism(group, index) {
  if (group.unsubscribeAvailable) {
    return {
      actionable: true,
      label: "ONE-CLICK",
      mode: "one-click",
      tone: "auto",
    };
  }

  if (group.reasoningSignals.listId) {
    return {
      actionable: false,
      label: index % 2 === 0 ? "HTTPS MANUAL" : "MAILTO MANUAL",
      mode: index % 2 === 0 ? "https-manual" : "mailto-manual",
      tone: "manual",
    };
  }

  return {
    actionable: false,
    label: "UNAVAILABLE",
    mode: "unavailable",
    tone: "muted",
  };
}

function buildDecisionGroups(dataset) {
  const picks = [];

  const selectors = [
    (group) => group.unsubscribeAvailable && group.unread > 0,
    (group) => !group.unsubscribeAvailable && group.reasoningSignals.listId && group.unread > 0,
    (group) => group.unsubscribeAvailable && group.category !== "TRANSACTIONAL",
    (group) => !group.unsubscribeAvailable && !group.reasoningSignals.listId,
    (group) => group.category === "TRANSACTIONAL" || group.category === "UPDATES",
  ];

  selectors.forEach((selector) => {
    const match = dataset.groups.find((group) => selector(group) && !picks.includes(group));

    if (match) {
      picks.push(match);
    }
  });

  dataset.groups.forEach((group) => {
    if (picks.length < 5 && !picks.includes(group)) {
      picks.push(group);
    }
  });

  return picks.slice(0, 5).map((group, index) => {
    const mechanism = getDecisionUnsubscribeMechanism(group, index);

    return {
      ...group,
      categoryLabel: CATEGORY_LABELS[group.category] || formatLabel(group.category),
      mechanism,
      visibleActions: [
        mechanism.mode === "one-click"
          ? "Unsubscribe"
          : mechanism.mode === "unavailable"
            ? null
            : "Review manual unsubscribe",
        group.unread > 0 ? "Move unread to Trash" : null,
      ].filter(Boolean),
    };
  });
}

function MessageCard({ accentColor, preview, sender, unread, compact = false }) {
  return (
    <div
      className={classNames(
        "rounded-[20px] border border-white/10 bg-[rgba(10,16,31,0.92)] px-3 py-3 text-left shadow-[0_14px_28px_rgba(0,0,0,0.22)]",
        compact ? "w-[164px]" : "w-[196px]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-white">{sender}</p>
          <p className="mt-1 text-xs text-slate-400">{preview}</p>
        </div>
        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: accentColor }} />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className={classNames(
          "rounded-full px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em]",
          unread ? "bg-[#f4c95d]/14 text-[#fbe9b2]" : "bg-white/6 text-slate-400",
        )}>
          {unread ? "Unread" : "Read"}
        </span>
      </div>
    </div>
  );
}

function SenderWell({ group, detail }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-slate-500">{group.category}</p>
          <h3 className="mt-2 text-lg font-semibold text-white">{group.label}</h3>
        </div>
        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: group.color }} />
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-300">{detail}</p>
    </div>
  );
}

function LensGlyph({ mode }) {
  const active = mode !== "idle";

  return (
    <div className={classNames(
      "relative h-16 w-16 rounded-full border border-white/18 bg-[radial-gradient(circle_at_35%_35%,rgba(255,255,255,0.34),rgba(255,255,255,0.08)_38%,rgba(56,189,248,0.16)_58%,rgba(0,0,0,0)_78%)] backdrop-blur-sm",
      active ? "shadow-[0_0_0_1px_rgba(244,201,93,0.35),0_12px_40px_rgba(56,189,248,0.18)]" : "shadow-[0_10px_32px_rgba(0,0,0,0.22)]",
    )}>
      <div className="absolute inset-[10px] rounded-full border border-white/18" />
      <motion.div
        className="absolute left-[15px] right-[15px] h-px bg-[#f4c95d]/70"
        animate={mode === "inspect"
          ? { opacity: [0.24, 0.9, 0.24], top: [22, 40, 22] }
          : mode === "recognize"
            ? { opacity: [0.8, 0.2, 0.8], top: [31, 31, 31] }
            : { opacity: active ? 0.45 : 0.18, top: 31 }}
        transition={active ? { duration: mode === "inspect" ? 1.1 : 0.55, repeat: Infinity, ease: "easeInOut" } : { duration: 0 }}
      />
      <div className="absolute bottom-[-14px] right-[-5px] h-8 w-3 rotate-[-35deg] rounded-full bg-white/14" />
      {active ? (
        <motion.div
          className="absolute inset-[18px] rounded-full border border-[#f4c95d]/40"
          animate={mode === "recognize" ? { scale: [1, 1.08, 1], opacity: [0.5, 1, 0.5] } : { scale: 1, opacity: 1 }}
          transition={mode === "recognize" ? { duration: 0.55, repeat: Infinity, ease: "easeInOut" } : { duration: 0 }}
        />
      ) : null}
    </div>
  );
}

function DestinationBucket({ attributes, count, forming, group, highlighted, liveCard, reducedMotion, unread, wasJustAssigned }) {
  const visibleCards = Math.min(Math.max(count, liveCard ? 1 : 0), 4);
  const badges = [group.category, ...attributes].slice(0, 2);

  return (
    <motion.div
      layout
      className={classNames(
        "rounded-[24px] border p-3 text-left transition-colors",
        forming
          ? "border-dashed border-cyan-300/20 bg-cyan-300/6"
          : "border-white/10 bg-[rgba(9,16,31,0.82)]",
      )}
      animate={reducedMotion
        ? { boxShadow: highlighted ? "0 0 0 1px rgba(56,189,248,0.24)" : "0 12px 32px rgba(0,0,0,0.18)", scale: 1 }
        : {
          boxShadow: wasJustAssigned
            ? ["0 12px 32px rgba(0,0,0,0.18)", "0 0 0 1px rgba(244,201,93,0.24), 0 18px 42px rgba(8,145,178,0.22)", "0 12px 32px rgba(0,0,0,0.18)"]
            : highlighted
              ? "0 0 0 1px rgba(56,189,248,0.24), 0 14px 34px rgba(8,145,178,0.12)"
              : "0 12px 32px rgba(0,0,0,0.18)",
          scale: wasJustAssigned ? [1, 1.02, 1] : 1,
        }}
      transition={reducedMotion ? { duration: 0 } : { duration: wasJustAssigned ? 0.62 : 0.4, ease: "easeInOut" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">{forming ? "new destination" : "destination"}</p>
          <h3 className="mt-2 text-base font-semibold text-white">{group.label}</h3>
        </div>
        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: group.color }} />
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs text-slate-300">
        <span className="font-mono uppercase tracking-[0.16em] text-slate-500">{count} messages</span>
        {unread > 0 ? <span className="font-mono uppercase tracking-[0.16em] text-[#fbe9b2]">{unread} unread</span> : null}
      </div>
      <div className="mt-3 grid gap-3">
        <div className="min-h-[84px] rounded-[18px] border border-white/8 bg-black/18 p-2">
          {liveCard ? (
            <motion.div layout className="origin-top-left scale-[0.84]">
              {liveCard}
            </motion.div>
          ) : (
            <div className="flex h-full items-end gap-2 px-1 pb-1">
              {Array.from({ length: visibleCards || 1 }).map((_, index) => (
                <motion.div
                  key={`${group.id}-stack-${index}`}
                  layout
                  className={classNames(
                    "h-12 w-9 rounded-[12px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))]",
                    forming && count === 0 ? "opacity-35" : "opacity-100",
                  )}
                  style={{ marginLeft: index === 0 ? 0 : -10 }}
                />
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {badges.map((badge) => (
            <span key={badge} className="rounded-full border border-white/10 bg-white/6 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-slate-200">
              {badge}
            </span>
          ))}
          {forming ? <span className="rounded-full border border-cyan-300/24 bg-cyan-300/12 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-cyan-100">Discovering</span> : null}
        </div>
      </div>
    </motion.div>
  );
}

function DecisionSenderCard({ entry, expanded, onToggle, reducedMotion, selected }) {
  return (
    <motion.button
      layout
      disabled={!expanded}
      onClick={onToggle}
      type="button"
      className={classNames(
        "w-full rounded-[28px] border p-4 text-left transition-colors disabled:cursor-default",
        expanded ? "bg-[rgba(8,14,25,0.86)]" : "bg-[rgba(8,14,25,0.66)]",
        selected ? "border-cyan-300/34" : "border-white/10",
      )}
      animate={reducedMotion
        ? { boxShadow: selected ? "0 0 0 1px rgba(56,189,248,0.24)" : "0 14px 32px rgba(0,0,0,0.18)", y: 0 }
        : {
          boxShadow: selected
            ? "0 0 0 1px rgba(56,189,248,0.24), 0 20px 40px rgba(8,145,178,0.12)"
            : "0 14px 32px rgba(0,0,0,0.18)",
          y: selected ? -6 : 0,
        }}
      transition={reducedMotion ? { duration: 0 } : { duration: 0.32, ease: "easeInOut" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">{expanded ? "sender" : "destination"}</p>
          <h3 className="mt-2 text-lg font-semibold text-white">{entry.label}</h3>
        </div>
        <div className="flex items-center gap-2">
          {expanded ? (
            <span className={classNames(
              "rounded-full border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em]",
              selected
                ? "border-cyan-300/28 bg-cyan-300/12 text-cyan-100"
                : "border-white/10 bg-white/6 text-slate-300",
            )}>
              {selected ? "Selected" : "Select"}
            </span>
          ) : null}
          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: entry.color }} />
        </div>
      </div>

      <AnimatePresence initial={false} mode="wait">
        {expanded ? (
          <motion.div
            key={`${entry.id}-expanded`}
            initial={reducedMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducedMotion ? undefined : { opacity: 0, y: -10 }}
            transition={{ duration: reducedMotion ? 0 : 0.28, ease: "easeOut" }}
            className="mt-4 grid gap-4"
          >
            <div className="rounded-[20px] border border-white/8 bg-black/18 px-3 py-3">
              <p className="text-sm text-slate-200">
                <span className="font-semibold text-white">{entry.messageCount} messages</span>
                <span className="text-slate-500"> · </span>
                <span className="font-semibold text-[#fbe9b2]">{entry.unread} unread</span>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-white/10 bg-white/6 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-100">
                {entry.categoryLabel}
              </span>
              <span className={classNames(
                "rounded-full border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em]",
                entry.mechanism.tone === "auto"
                  ? "border-[#f4c95d]/22 bg-[#f4c95d]/12 text-[#fbe9b2]"
                  : entry.mechanism.tone === "manual"
                    ? "border-cyan-300/22 bg-cyan-300/12 text-cyan-100"
                    : "border-white/10 bg-white/6 text-slate-400",
              )}>
                {entry.mechanism.label}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {entry.visibleActions.map((action) => (
                <span
                  key={action}
                  className={classNames(
                    "rounded-full border px-3 py-2 text-sm",
                    action === "Unsubscribe"
                      ? "border-[#f4c95d]/24 bg-[#f4c95d]/12 text-[#fbe9b2]"
                      : action === "Review manual unsubscribe"
                        ? "border-cyan-300/24 bg-cyan-300/12 text-cyan-100"
                        : "border-white/10 bg-black/18 text-slate-200",
                  )}
                >
                  {action}
                </span>
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key={`${entry.id}-compact`}
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 flex items-end gap-2"
          >
            {Array.from({ length: Math.min(Math.max(Math.ceil(entry.messageCount / 24), 1), 4) }).map((_, index) => (
              <div
                key={`${entry.id}-mini-${index}`}
                className="h-12 w-9 rounded-[12px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))]"
                style={{ marginLeft: index === 0 ? 0 : -10 }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

function CleanupSenderTile({ entry, active, compact = false, reducedMotion, selected }) {
  return (
    <motion.div
      layout
      className={classNames(
        "rounded-[24px] border bg-[rgba(8,14,25,0.86)] p-4 text-left shadow-[0_16px_34px_rgba(0,0,0,0.2)]",
        selected || active ? "border-cyan-300/28" : "border-white/10",
      )}
      animate={reducedMotion
        ? { scale: 1, boxShadow: active ? "0 0 0 1px rgba(56,189,248,0.24)" : "0 16px 34px rgba(0,0,0,0.2)" }
        : { scale: active ? 1.02 : 1, y: active ? -4 : 0 }}
      transition={reducedMotion ? { duration: 0 } : { duration: 0.28, ease: "easeInOut" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">selected sender</p>
          <h3 className={classNames("mt-2 font-semibold text-white", compact ? "text-base" : "text-lg")}>{entry.label}</h3>
        </div>
        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: entry.color }} />
      </div>
      <p className="mt-4 text-sm text-slate-200">
        <span className="font-semibold text-white">{entry.messageCount} messages</span>
        <span className="text-slate-500"> · </span>
        <span className="font-semibold text-[#fbe9b2]">{entry.trashAmount} unread</span>
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="rounded-full border border-white/10 bg-white/6 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-100">
          {entry.categoryLabel}
        </span>
        <span className={classNames(
          "rounded-full border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em]",
          entry.cleanupAction === "auto"
            ? "border-[#f4c95d]/24 bg-[#f4c95d]/12 text-[#fbe9b2]"
            : entry.cleanupAction === "manual"
              ? "border-cyan-300/24 bg-cyan-300/12 text-cyan-100"
              : "border-white/10 bg-white/6 text-slate-400",
        )}>
          {entry.actionChip}
        </span>
      </div>
    </motion.div>
  );
}

function useReferencePlayback(frameCount, frameDuration, reducedMotion) {
  const [frame, setFrame] = useState(0);
  const [running, setRunning] = useState(false);
  const [complete, setComplete] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);

  useEffect(() => {
    if (!running || reducedMotion || complete) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setFrame((current) => {
        const next = current + 1;

        if (next >= frameCount - 1) {
          setRunning(false);
          setComplete(true);
          return frameCount - 1;
        }

        return next;
      });
    }, frameDuration);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [complete, frame, frameCount, frameDuration, reducedMotion, running]);

  function handlePlayPause() {
    if (complete) {
      return;
    }

    if (reducedMotion) {
      setHasStarted(true);
      setFrame(frameCount - 1);
      setComplete(true);
      setRunning(false);
      return;
    }

    setHasStarted(true);
    setRunning((current) => !current);
  }

  function handleReplay() {
    setFrame(0);
    setRunning(!reducedMotion);
    setComplete(false);
    setHasStarted(true);

    if (reducedMotion) {
      window.setTimeout(() => {
        setFrame(frameCount - 1);
        setComplete(true);
      }, 0);
    }
  }

  return {
    complete,
    frame,
    handlePlayPause,
    handleReplay,
    hasStarted,
    running,
    status: complete ? "Complete" : running ? "Running" : hasStarted ? "Paused" : "Ready",
  };
}

function ReferenceControlButton({ active = false, ariaLabel, children, onClick }) {
  return (
    <motion.button
      aria-label={ariaLabel}
      aria-pressed={active}
      className={classNames(
        "rounded-full border px-3 py-1.5 text-xs font-medium tracking-[0.02em] transition-colors",
        active
          ? "border-cyan-300/32 bg-cyan-300/12 text-cyan-100"
          : "border-white/12 bg-white/4 text-slate-300 hover:border-white/24 hover:bg-white/6",
      )}
      onClick={onClick}
      type="button"
      whileTap={{ scale: 0.97 }}
      whileHover={{ scale: 1.01 }}
    >
      {children}
    </motion.button>
  );
}

function ReferenceStudyShell({ children, controlPrefix, playback, reducedMotion, title }) {
  const playLabel = playback.complete ? "Complete" : playback.running ? "Pause" : playback.hasStarted ? "Resume" : "Play";

  return (
    <section className="rounded-[28px] border border-white/10 bg-[rgba(8,13,22,0.66)] p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-white">{title}</h3>
        <span className={classNames(
          "rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em]",
          playback.complete
            ? "border-emerald-300/28 bg-emerald-300/12 text-emerald-100"
            : playback.running
              ? "border-cyan-300/24 bg-cyan-300/10 text-cyan-100"
              : "border-white/12 bg-white/4 text-slate-400",
        )}>
          {playback.status}
        </span>
      </div>
      <div className="mt-4">{children}</div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex gap-2">
          <ReferenceControlButton
            active={playback.running}
            ariaLabel={`${playLabel} ${controlPrefix} study`}
            onClick={playback.handlePlayPause}
          >
            {playLabel}
          </ReferenceControlButton>
          <ReferenceControlButton
            ariaLabel={`Replay ${controlPrefix} study`}
            onClick={playback.handleReplay}
          >
            Replay
          </ReferenceControlButton>
        </div>
        <span className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
          {reducedMotion ? "Reduced motion" : playback.complete ? "Done" : playback.running ? "Live" : "Deterministic"}
        </span>
      </div>
    </section>
  );
}

function GatherStudy({ reducedMotion }) {
  const playback = useReferencePlayback(4, 260, reducedMotion);
  const frame = reducedMotion || playback.complete ? 3 : playback.frame;
  const positions = [
    { x: 2, y: 8 },
    { x: 78, y: 6 },
    { x: 4, y: 68 },
    { x: 80, y: 64 },
    { x: 34, y: 2 },
    { x: 46, y: 76 },
  ];
  const cluster = [
    { x: 34, y: 32 },
    { x: 48, y: 28 },
    { x: 40, y: 45 },
    { x: 55, y: 44 },
    { x: 43, y: 18 },
    { x: 46, y: 56 },
  ];

  return (
    <ReferenceStudyShell controlPrefix="Gather" playback={playback} reducedMotion={reducedMotion} title="Gather">
      <div className="relative h-[220px] overflow-hidden rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))]">
        <motion.div
          aria-hidden="true"
          className="absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10"
          animate={reducedMotion
            ? { opacity: 0.85, scale: 1 }
            : frame === 1
              ? { opacity: [0.34, 0.7], scale: [1, 1.06] }
              : frame >= 2
                ? { opacity: [0.5, 1, 0.72], scale: [0.96, 1.1, 1] }
                : { opacity: 0.3, scale: 1 }}
          transition={reducedMotion ? { duration: 0 } : { duration: frame >= 2 ? 0.36 : 0.2, ease: "easeOut" }}
        />
        {positions.map((position, index) => {
          const target = cluster[index];
          const anticipationX = position.x + (position.x < 42 ? -4 : 4);
          const anticipationY = position.y + (position.y < 40 ? -4 : 4);
          const animate = frame === 0
            ? { x: `${position.x}%`, y: `${position.y}%`, scale: 1, rotate: (index - 3) * 4 }
            : frame === 1
              ? { x: `${anticipationX}%`, y: `${anticipationY}%`, scale: 0.96, rotate: (index - 3) * 2 }
              : frame === 2
              ? { x: `${target.x + (index % 2 === 0 ? -1.5 : 1.5)}%`, y: `${target.y + (index < 3 ? -1 : 1)}%`, scale: 1.03, rotate: 0 }
              : { x: `${target.x}%`, y: `${target.y}%`, scale: 1, rotate: 0 };

          return (
            <motion.div
              key={`gather-${index}`}
              aria-hidden="true"
              className="absolute h-14 w-14 rounded-[18px] border border-white/10 bg-[rgba(255,255,255,0.08)]"
              animate={animate}
              initial={false}
              transition={{ type: "spring", stiffness: frame >= 2 ? 260 : 220, damping: frame >= 2 ? 20 : 18, mass: 0.72, delay: frame >= 2 ? index * 0.018 : index * 0.012 }}
            />
          );
        })}
      </div>
    </ReferenceStudyShell>
  );
}

function SweepStudy({ reducedMotion }) {
  const playback = useReferencePlayback(5, 220, reducedMotion);
  const frame = reducedMotion || playback.complete ? 4 : playback.frame;
  const cards = [
    { x: 14, y: 50 },
    { x: 24, y: 38 },
    { x: 33, y: 57 },
    { x: 44, y: 42 },
    { x: 56, y: 54 },
  ];

  return (
    <ReferenceStudyShell controlPrefix="Sweep" playback={playback} reducedMotion={reducedMotion} title="Sweep">
      <div className="relative h-[220px] overflow-hidden rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))]">
        <div className="absolute bottom-[14%] left-[8%] right-[8%] h-px bg-white/8" />
        <motion.div
          aria-hidden="true"
          className="absolute left-[2%] top-[56%] h-12 w-40 origin-left"
          animate={frame === 0
            ? { rotate: -14, x: "0%" }
            : frame === 1
              ? { rotate: -8, x: "18%" }
              : frame === 2
                ? { rotate: -2, x: "34%" }
                : frame === 3
                  ? { rotate: 4, x: "50%" }
                  : { rotate: 8, x: "62%" }}
          transition={reducedMotion ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 24, mass: 0.7 }}
        >
          <div className="absolute left-0 top-3 h-1 w-24 rounded-full bg-[#f4c95d]/70" />
          <div className="absolute right-0 top-0 h-8 w-12 rounded-[14px] border border-[#f4c95d]/24 bg-[#f4c95d]/12" />
          <div className="absolute right-2 top-5 h-4 w-8 rounded-b-[12px] border-x border-b border-white/12 bg-white/6" />
        </motion.div>
        {cards.map((card, index) => {
          const pushedX = frame === 0
            ? card.x
            : frame === 1
              ? card.x + (index === 0 ? 16 : index === 1 ? 8 : 0)
              : frame === 2
                ? card.x + (index <= 2 ? 22 : index === 3 ? 10 : 0)
                : frame === 3
                  ? card.x + (index <= 3 ? 34 : 18)
                  : 72 + index * 2;
          const pushedY = frame <= 2
            ? card.y
            : frame === 3
              ? card.y + (index % 2 === 0 ? -2 : 4)
              : 40 + index * 8;
          const rotation = frame === 0 ? (index % 2 === 0 ? -4 : 3) : frame <= 2 ? 1 : 4;

          return (
            <motion.div
              key={`sweep-${index}`}
              aria-hidden="true"
              className="absolute h-14 w-20 rounded-[16px] border border-white/10 bg-[rgba(255,255,255,0.08)]"
              animate={{ x: `${pushedX}%`, y: `${pushedY}%`, rotate: rotation }}
              initial={false}
              transition={{ type: "spring", stiffness: 300, damping: 24, mass: 0.72, delay: frame > 0 ? index * 0.018 : 0 }}
            />
          );
        })}
        <motion.div
          aria-hidden="true"
          className="absolute bottom-[12%] right-[6%] h-20 w-24 rounded-[18px] border border-white/10 bg-black/20"
          animate={frame === 4 ? { scale: [1, 1.04, 1], x: [0, 2, 0] } : { scale: 1, x: 0 }}
          transition={reducedMotion ? { duration: 0 } : { duration: 0.28, ease: "easeOut" }}
        />
      </div>
    </ReferenceStudyShell>
  );
}

function DepositStudy({ reducedMotion }) {
  const playback = useReferencePlayback(5, 210, reducedMotion);
  const frame = reducedMotion || playback.complete ? 4 : playback.frame;
  const cards = [
    { x: 12, y: 24 },
    { x: 20, y: 52 },
    { x: 54, y: 26 },
    { x: 60, y: 50 },
  ];

  return (
    <ReferenceStudyShell controlPrefix="Deposit" playback={playback} reducedMotion={reducedMotion} title="Deposit">
      <div className="relative h-[220px] overflow-hidden rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))]">
        <motion.div
          aria-hidden="true"
          className="absolute left-1/2 top-[26%] z-10 h-3 w-24 -translate-x-1/2 rounded-full border border-white/12 bg-[rgba(255,255,255,0.08)]"
          animate={reducedMotion
            ? { rotate: -24, x: "-50%", y: 0 }
            : frame <= 2
              ? { rotate: -24, x: "-50%", y: 0 }
              : frame === 3
                ? { rotate: 0, x: "-50%", y: 3 }
                : { rotate: -4, x: "-50%", y: 1 }}
          transition={reducedMotion ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 22, mass: 0.68 }}
          style={{ transformOrigin: "14% 50%" }}
        />
        <motion.div
          aria-hidden="true"
          className="absolute left-1/2 top-[30%] h-28 w-24 -translate-x-1/2"
          animate={frame >= 3
            ? { scale: [1, 1.04, 0.99, 1], y: [0, 2, -1, 0] }
            : { scale: 1, y: 0 }}
          transition={reducedMotion ? { duration: 0 } : { duration: 0.2, ease: "easeOut" }}
        >
          <div className="absolute left-1/2 top-0 h-3 w-16 -translate-x-1/2 rounded-full border border-white/10 bg-black/26" />
          <div className="absolute left-1/2 top-2 h-20 w-18 -translate-x-1/2 rounded-b-[20px] border border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.1),rgba(255,255,255,0.03))]" />
        </motion.div>
        {cards.map((card, index) => {
          if (frame === 4) {
            return null;
          }

          const x = frame === 0
            ? card.x
            : frame === 1
              ? 36 + index * 8
              : frame === 2
                ? 44 + (index % 2) * 5
                : 46 + (index % 2) * 3;
          const y = frame === 0
            ? card.y
            : frame === 1
              ? 24 + index * 10
              : frame === 2
                ? 18 + index * 4
                : 44 + index * 11;
          const opacity = frame === 3 ? (index < 2 ? 0.94 : 1) : 1;
          const scale = frame === 3 ? 0.96 : 1;

          return (
            <motion.div
              key={`deposit-${index}`}
              aria-hidden="true"
              className="absolute z-20 h-12 w-18 rounded-[14px] border border-white/10 bg-[rgba(255,255,255,0.08)]"
              animate={{ opacity, scale, x: `${x}%`, y: `${y}%`, rotate: frame >= 2 ? 0 : index % 2 === 0 ? -5 : 4 }}
              initial={false}
              transition={{ type: "spring", stiffness: frame >= 2 ? 320 : 240, damping: frame >= 2 ? 24 : 18, mass: 0.68, delay: frame > 0 ? index * 0.016 : 0 }}
            />
          );
        })}
      </div>
    </ReferenceStudyShell>
  );
}

function FeedStudy({ reducedMotion }) {
  const playback = useReferencePlayback(5, 220, reducedMotion);
  const frame = reducedMotion || playback.complete ? 4 : playback.frame;
  const cardState = frame === 0
    ? { opacity: 1, rotate: -6, scale: 1, x: "12%", y: "44%" }
    : frame === 1
      ? { opacity: 1, rotate: 0, scale: 1, x: "46%", y: "44%" }
      : frame === 2
      ? { opacity: 1, rotate: 0, scale: 0.98, x: "58%", y: "42%" }
        : frame === 3
      ? { opacity: 1, rotate: 0, scale: 0.74, x: "66%", y: "42%" }
      : { opacity: 0, rotate: 0, scale: 0.16, x: "69%", y: "42%" };

  return (
    <ReferenceStudyShell controlPrefix="Feed" playback={playback} reducedMotion={reducedMotion} title="Feed">
      <div className="relative h-[220px] overflow-hidden rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))]">
        <motion.div
          aria-hidden="true"
          className="absolute right-[10%] top-[30%] h-28 w-32 rounded-[24px] border border-white/12 bg-[rgba(255,255,255,0.05)] p-4"
          animate={frame >= 3 ? { boxShadow: ["0 12px 24px rgba(0,0,0,0.16)", "0 18px 40px rgba(56,189,248,0.1)", "0 12px 24px rgba(0,0,0,0.16)"], x: [0, 2, 0] } : { boxShadow: "0 12px 24px rgba(0,0,0,0.16)", x: 0 }}
          transition={reducedMotion ? { duration: 0 } : { duration: 0.24, ease: "easeOut" }}
        >
          <div className="mx-auto mt-3 h-3 w-16 rounded-full border border-cyan-300/18 bg-cyan-300/8" />
          <div className="mt-5 grid gap-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <motion.div
                key={`feed-bar-${index}`}
                className="h-1.5 rounded-full bg-white/10"
                animate={frame >= 3 ? { opacity: [0.45, 1, 0.45], x: [0, 6, 0] } : { opacity: 0.75, x: 0 }}
                transition={reducedMotion ? { duration: 0 } : { duration: 0.2, delay: index * 0.02, repeat: frame >= 3 ? 2 : 0 }}
              />
            ))}
          </div>
        </motion.div>
        <motion.div
          aria-hidden="true"
          className="absolute h-14 w-24 rounded-[16px] border border-white/10 bg-[rgba(255,255,255,0.08)]"
          animate={cardState}
          initial={false}
          transition={reducedMotion ? { duration: 0 } : { type: "spring", stiffness: frame >= 2 ? 320 : 240, damping: frame >= 2 ? 24 : 18, mass: 0.68 }}
        />
      </div>
    </ReferenceStudyShell>
  );
}

function SeverStudy({ reducedMotion }) {
  const playback = useReferencePlayback(4, 210, reducedMotion);
  const frame = reducedMotion || playback.complete ? 3 : playback.frame;

  return (
    <ReferenceStudyShell controlPrefix="Sever" playback={playback} reducedMotion={reducedMotion} title="Sever">
      <div className="relative h-[220px] overflow-hidden rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))]">
        <motion.div
          aria-hidden="true"
          className="absolute left-[16%] top-[42%] z-10 h-9 w-9 rounded-full border border-white/12 bg-white/8"
          animate={frame === 0 ? { x: 0, y: 0 } : frame === 1 ? { x: "-3%", y: 0 } : frame === 2 ? { x: "-5%", y: 0 } : { x: "-2%", y: 0 }}
          transition={reducedMotion ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 24, mass: 0.7 }}
        />
        <motion.div
          aria-hidden="true"
          className="absolute right-[16%] top-[42%] z-10 h-9 w-9 rounded-full border border-white/12 bg-white/8"
          animate={frame === 0 ? { x: 0, y: 0 } : frame === 1 ? { x: "3%", y: 0 } : frame === 2 ? { x: "5%", y: 0 } : { x: "2%", y: 0 }}
          transition={reducedMotion ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 24, mass: 0.7 }}
        />
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
          <motion.path
            d="M 18 50 L 50 50"
            fill="none"
            stroke="rgba(244,201,93,0.92)"
            strokeLinecap="round"
            strokeWidth="2.4"
            animate={frame === 0 ? { d: "M 18 50 L 50 50", opacity: 0.96 } : frame === 1 ? { d: "M 16 50 L 50 50", opacity: 1 } : frame === 2 ? { d: "M 16 50 L 42 50", opacity: 1 } : { d: "M 16 50 L 38 50", opacity: 0 }}
            initial={false}
            transition={reducedMotion ? { duration: 0 } : { duration: frame === 2 ? 0.08 : 0.16, ease: "easeOut" }}
          />
          <motion.path
            d="M 50 50 L 82 50"
            fill="none"
            stroke="rgba(244,201,93,0.92)"
            strokeLinecap="round"
            strokeWidth="2.4"
            animate={frame === 0 ? { d: "M 50 50 L 82 50", opacity: 0.96 } : frame === 1 ? { d: "M 50 50 L 84 50", opacity: 1 } : frame === 2 ? { d: "M 58 50 L 84 50", opacity: 1 } : { d: "M 62 50 L 84 50", opacity: 0 }}
            initial={false}
            transition={reducedMotion ? { duration: 0 } : { duration: frame === 2 ? 0.08 : 0.16, ease: "easeOut" }}
          />
        </svg>
      </div>
    </ReferenceStudyShell>
  );
}

function SettleStudy({ reducedMotion }) {
  const playback = useReferencePlayback(4, 340, reducedMotion);
  const frame = reducedMotion || playback.complete ? 3 : playback.frame;
  const settled = frame >= 2;
  const items = settled
    ? [
      { id: "a", label: "A", level: "primary" },
      { id: "b", label: "B", level: "primary" },
      { id: "c", label: "C", level: "secondary" },
      { id: "d", label: "D", level: "secondary" },
      { id: "e", label: "E", level: "secondary" },
      { id: "f", label: "F", level: "secondary" },
    ]
    : [
      { id: "d", label: "D", level: "secondary" },
      { id: "a", label: "A", level: "primary" },
      { id: "f", label: "F", level: "secondary" },
      { id: "c", label: "C", level: "secondary" },
      { id: "b", label: "B", level: "primary" },
      { id: "e", label: "E", level: "secondary" },
    ];

  return (
    <ReferenceStudyShell controlPrefix="Settle" playback={playback} reducedMotion={reducedMotion} title="Settle">
      <motion.div
        layout
        className={classNames(
          "min-h-[220px] rounded-[24px] border border-white/8 p-3",
          settled ? "grid grid-cols-3 gap-3" : "flex flex-wrap items-start gap-3",
        )}
        transition={{ type: "spring", stiffness: 240, damping: 22, mass: 0.75 }}
      >
        {items.map((item, index) => (
          <motion.div
            key={item.id}
            layout
            className={classNames(
              "rounded-[18px] border border-white/10 bg-[rgba(255,255,255,0.07)] px-3 py-4 text-center text-sm font-semibold text-white",
              item.level === "primary" ? "h-20" : "h-14",
              settled && item.level === "primary" ? "col-span-1" : "",
            )}
            initial={false}
            animate={{ opacity: 1, rotate: settled ? 0 : ((index % 3) - 1) * 8, scale: settled ? 1 : 0.97, y: settled ? 0 : (index % 2 === 0 ? -10 : 10) }}
            transition={{ type: "spring", stiffness: settled ? 260 : 220, damping: settled ? 22 : 18, mass: 0.72, delay: settled ? index * 0.028 : index * 0.012 }}
          >
            {item.label}
          </motion.div>
        ))}
      </motion.div>
    </ReferenceStudyShell>
  );
}

function AnimationReferenceLab({ reducedMotion }) {
  return (
    <StageShell
      title="Study how Pidgeot objects should move."
      description="A disposable motion sketchbook for relationship-driven movement. Each study isolates one physical idea so the animation language can be judged before it enters the product experiments."
      footer={[
        <CompactStat key="studies" label="Studies" value={REFERENCE_STUDIES.length} />,
        <CompactStat key="engine" label="Animation" value="Motion" />,
        <CompactStat key="mode" label="Scope" value="Reference only" />,
      ]}
    >
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <GatherStudy reducedMotion={reducedMotion} />
        <SweepStudy reducedMotion={reducedMotion} />
        <DepositStudy reducedMotion={reducedMotion} />
        <FeedStudy reducedMotion={reducedMotion} />
        <SeverStudy reducedMotion={reducedMotion} />
        <SettleStudy reducedMotion={reducedMotion} />
      </div>
    </StageShell>
  );
}

function PidgeotMachineExperiment({ dataset, panelKey, reducedMotion, runVersion }) {
  const machineMessages = useMemo(() => buildMachineMessages(dataset), [dataset]);
  const machineOrder = useMemo(() => buildMachineOrder(machineMessages), [machineMessages]);
  const [messageIndex, setMessageIndex] = useState(0);
  const [phaseIndex, setPhaseIndex] = useState(0);

  useEffect(() => {
    if (reducedMotion) {
      return undefined;
    }

    const activePhase = MACHINE_PHASES[phaseIndex];
    const timeoutId = window.setTimeout(() => {
      if (phaseIndex === MACHINE_PHASES.length - 1) {
        if (messageIndex < machineMessages.length - 1) {
          setMessageIndex((current) => current + 1);
          setPhaseIndex(0);
        }

        return;
      }

      setPhaseIndex((current) => current + 1);
    }, activePhase.duration);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [machineMessages.length, messageIndex, phaseIndex, reducedMotion, runVersion]);

  const phase = reducedMotion ? MACHINE_PHASES[MACHINE_PHASES.length - 1] : MACHINE_PHASES[phaseIndex];
  const activeMessage = machineMessages[reducedMotion ? machineMessages.length - 1 : messageIndex];
  const landedCount = reducedMotion
    ? machineMessages.length
    : messageIndex + ((phase.id === "land" || phase.id === "pause") ? 1 : 0);
  const landedGroups = buildMachineGroupState(machineMessages, landedCount);
  const groupsBeforeCurrent = buildMachineGroupState(machineMessages, reducedMotion ? machineMessages.length : messageIndex);
  const senderAlreadyKnown = groupsBeforeCurrent.has(activeMessage.group.label);
  const activeInspectionSignals = MACHINE_SIGNAL_COPY[activeMessage.group.label] || [];
  const queueMessages = machineMessages.slice(messageIndex + 1, messageIndex + 5);
  const showFormingDestination = !senderAlreadyKnown && ["recognize", "travel", "land", "pause"].includes(phase.id) && !reducedMotion;
  const destinationEntries = machineOrder.reduce((entries, label) => {
    const entry = landedGroups.get(label);

    if (entry) {
      entries.push({ ...entry, forming: false });
      return entries;
    }

    if (showFormingDestination && activeMessage.group.label === label) {
      entries.push({
        attributes: [],
        count: 0,
        discoveredAt: messageIndex,
        forming: true,
        group: activeMessage.group,
      });
    }

    return entries;
  }, []);
  const destinationLabel = senderAlreadyKnown ? activeMessage.group.label : `New sender: ${activeMessage.group.label}`;
  const messageLayoutId = `machine-trace-${panelKey}-${activeMessage.id}`;
  const showMessageInQueue = phase.id === "queue" && !reducedMotion;
  const showMessageInInspection = reducedMotion || phase.id === "inspect" || phase.id === "recognize";
  const showMessageInDestination = !reducedMotion && ["travel", "land", "pause"].includes(phase.id);
  const {
    hiddenCount: hiddenDestinationCount,
    visibleEntries: visibleDestinationEntries,
  } = buildVisibleDestinationEntries(
    destinationEntries,
    reducedMotion || phase.id !== "queue" ? activeMessage.group.label : null,
  );
  const phaseLabel = {
    queue: "Incoming",
    inspect: "Inspecting",
    recognize: "Recognised",
    travel: "Assigning",
    land: "Landed",
    pause: "Ready",
  }[phase.id];

  return (
    <StageShell
      title="Watch Pidgeot discover who belongs together."
      description="Messages arrive, the lens inspects them, then they join known sender groups or create new ones."
      footer={[
        <CompactStat key="messages" label="Messages discovered" value="1,842" />,
        <CompactStat key="senders" label="Senders found" value="73" />,
        <CompactStat key="unsubscribes" label="Unsubscribe paths" value="27" />,
      ]}
    >
      <LayoutGroup>
        <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.1),transparent_26%),linear-gradient(180deg,rgba(7,12,22,0.96),rgba(4,8,17,0.98))] p-4 sm:p-5 lg:p-6">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),transparent)]" />
          <div className="pointer-events-none absolute bottom-[22%] left-[38%] right-[20%] hidden h-px bg-[linear-gradient(90deg,rgba(255,255,255,0.04),rgba(56,189,248,0.16),rgba(255,255,255,0.04))] xl:block" />

          <div className="relative grid gap-5 xl:min-h-[780px] xl:grid-cols-[minmax(0,1.42fr)_minmax(320px,0.78fr)] xl:items-start">
            <div className="grid gap-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Processing area</p>
                  <p className="mt-1 text-sm text-slate-300">Incoming messages, inspection, then assignment.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <CompactStat label="Queue" value={queueMessages.length + (showMessageInQueue ? 1 : 0)} />
                  <CompactStat label="Phase" value={phaseLabel} />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-[repeat(4,minmax(0,1fr))]">
                {showMessageInQueue ? [activeMessage, ...queueMessages].slice(0, 4).map((message, index) => {
                  const isActiveQueueCard = index === 0;

                  return (
                    <div key={`queue-slot-${message.id}`} className="min-h-[110px] rounded-[24px] border border-white/8 bg-white/4 p-2">
                      {isActiveQueueCard ? (
                        <motion.div
                          layoutId={messageLayoutId}
                          transition={{ type: "spring", stiffness: 120, damping: 18, mass: 0.95 }}
                        >
                          <MessageCard
                            accentColor={message.color}
                            compact
                            preview={message.preview}
                            sender={message.group.label}
                            unread={message.unread}
                          />
                        </motion.div>
                      ) : (
                        <motion.div animate={{ opacity: 0.52, scale: 0.98 }} transition={{ duration: reducedMotion ? 0 : 0.25 }}>
                          <MessageCard
                            accentColor={message.color}
                            compact
                            preview={message.preview}
                            sender={message.group.label}
                            unread={message.unread}
                          />
                        </motion.div>
                      )}
                    </div>
                  );
                }) : queueMessages.map((message) => (
                  <motion.div
                    key={`queue-slot-${message.id}`}
                    animate={{ opacity: 0.42, scale: 0.97 }}
                    transition={{ duration: reducedMotion ? 0 : 0.25 }}
                    className="min-h-[110px] rounded-[24px] border border-white/8 bg-white/4 p-2"
                  >
                    <MessageCard
                      accentColor={message.color}
                      compact
                      preview={message.preview}
                      sender={message.group.label}
                      unread={message.unread}
                    />
                  </motion.div>
                ))}
              </div>

              <div className="grid gap-4 lg:grid-cols-[1.06fr_0.94fr]">
                <div className="relative min-h-[360px] rounded-[30px] border border-white/10 bg-[rgba(10,16,31,0.82)] p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Inspection lens</p>
                      <h3 className="mt-2 text-xl font-semibold text-white">{activeMessage.group.label}</h3>
                      <p className="mt-1 text-sm text-slate-400">{activeMessage.preview}</p>
                    </div>
                    <LensGlyph mode={showMessageInInspection ? phase.id : reducedMotion ? "recognize" : "idle"} />
                  </div>

                  <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_0.95fr] lg:items-start">
                    <motion.div
                      layout
                      className={classNames(
                        "min-h-[212px] rounded-[26px] border p-3",
                        showMessageInInspection
                          ? "border-[#f4c95d]/26 bg-[#f4c95d]/6"
                          : "border-white/10 bg-white/4",
                      )}
                      animate={reducedMotion
                        ? { boxShadow: "0 0 0 1px rgba(244,201,93,0.18)" }
                        : showMessageInInspection
                          ? { boxShadow: ["0 0 0 1px rgba(244,201,93,0.18)", "0 14px 36px rgba(244,201,93,0.08)", "0 0 0 1px rgba(244,201,93,0.18)"] }
                          : { boxShadow: "0 12px 28px rgba(0,0,0,0.18)" }}
                      transition={reducedMotion ? { duration: 0 } : { duration: 1.05, repeat: showMessageInInspection ? Infinity : 0, ease: "easeInOut" }}
                    >
                      {showMessageInInspection ? (
                        <motion.div
                          layoutId={messageLayoutId}
                          transition={{ type: "spring", stiffness: 120, damping: 18, mass: 0.95 }}
                        >
                          <MessageCard
                            accentColor={activeMessage.color}
                            preview={activeMessage.preview}
                            sender={activeMessage.group.label}
                            unread={activeMessage.unread}
                          />
                        </motion.div>
                      ) : (
                        <div className="flex h-full items-center justify-center rounded-[22px] border border-dashed border-white/10 bg-black/16 text-sm text-slate-500">
                          {phase.id === "travel" ? "Assignment in progress" : "Waiting for next message"}
                        </div>
                      )}
                    </motion.div>

                    <div className="rounded-[24px] bg-white/5 p-4">
                      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-500">Observed now</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {activeInspectionSignals.map((signal, index) => (
                          <motion.span
                            key={`${activeMessage.id}-${signal}`}
                            initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: reducedMotion ? 0 : 0.28, delay: reducedMotion ? 0 : index * 0.08 }}
                            className="rounded-full border border-white/10 bg-black/22 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-white"
                          >
                            {signal}
                          </motion.span>
                        ))}
                      </div>
                      <motion.div
                        className="mt-4 rounded-[18px] border border-cyan-300/18 bg-cyan-300/8 px-3 py-3"
                        animate={reducedMotion
                          ? { opacity: 1 }
                          : phase.id === "recognize"
                            ? { opacity: [0.68, 1, 0.68] }
                            : { opacity: 1 }}
                        transition={reducedMotion ? { duration: 0 } : { duration: 0.52, repeat: phase.id === "recognize" ? Infinity : 0, ease: "easeInOut" }}
                      >
                        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-cyan-100/80">Recognition</p>
                        <p className="mt-2 text-sm font-semibold text-white">{destinationLabel}</p>
                        <p className="mt-1 text-xs text-slate-300">
                          {senderAlreadyKnown ? "Pidgeot matched this message to an existing sender group." : "Pidgeot is establishing a new sender destination from the observed signals."}
                        </p>
                      </motion.div>
                    </div>
                  </div>
                </div>

                <div className="rounded-[30px] border border-white/10 bg-[rgba(10,16,31,0.62)] p-4">
                  <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Assignment trace</p>
                  <div className="mt-4 grid gap-3">
                    {[
                      "Message enters the visible inbox window.",
                      "The lens inspects the active card and surfaces a few grounded signals.",
                      senderAlreadyKnown ? "The message is routed into an existing sender destination." : "A new sender destination is established for this message.",
                    ].map((line, index) => (
                      <div key={line} className="rounded-[18px] border border-white/8 bg-black/20 px-3 py-3 text-sm text-slate-200">
                        <span className="mr-2 font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">0{index + 1}</span>
                        {line}
                      </div>
                    ))}
                    {reducedMotion ? (
                      <div className="rounded-[18px] border border-cyan-300/18 bg-cyan-300/8 px-3 py-3 text-sm text-slate-200">
                        Reduced motion keeps the message and destination relationship visible without the travel animation.
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex min-h-[420px] flex-col rounded-[28px] border border-white/10 bg-[rgba(8,14,25,0.88)] p-4 sm:p-5 xl:h-[708px]">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Sender destinations</p>
                  <p className="mt-1 text-sm text-slate-300">Compact receiving groups for recurring senders.</p>
                </div>
                <CompactStat label="Visible groups" value={visibleDestinationEntries.length} />
              </div>

              <div className="flex-1 overflow-hidden">
                <div className="grid content-start gap-3">
                  {visibleDestinationEntries.map((entry) => {
                  const isCurrentDestination = entry.group.label === activeMessage.group.label;
                  const liveCard = showMessageInDestination && isCurrentDestination ? (
                    <motion.div
                      layoutId={messageLayoutId}
                      transition={{ type: "spring", stiffness: 116, damping: 19, mass: 0.96 }}
                    >
                      <MessageCard
                        accentColor={activeMessage.color}
                        compact
                        preview={activeMessage.preview}
                        sender={activeMessage.group.label}
                        unread={activeMessage.unread}
                      />
                    </motion.div>
                  ) : null;

                    return (
                      <DestinationBucket
                        key={`${entry.group.id}-${entry.count}-${entry.forming ? "forming" : "settled"}`}
                        attributes={entry.attributes}
                        count={entry.count}
                        forming={entry.forming}
                        group={entry.group}
                        highlighted={isCurrentDestination && (reducedMotion || phase.id !== "queue")}
                        liveCard={liveCard}
                        reducedMotion={reducedMotion}
                        unread={entry.group.unread}
                        wasJustAssigned={isCurrentDestination && (phase.id === "land" || phase.id === "pause")}
                      />
                    );
                  })}
                </div>
              </div>

              {hiddenDestinationCount > 0 ? (
                <div className="mt-4 flex items-center justify-between gap-3 rounded-[18px] border border-white/8 bg-black/18 px-3 py-3 text-sm text-slate-300">
                  <span>Older groups stay off-stage while the active buckets remain visible.</span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-400">+ {hiddenDestinationCount} more</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </LayoutGroup>
    </StageShell>
  );
}

function ScanRitualExperiment({ dataset, panelKey, reducedMotion, runVersion }) {
  const batches = useMemo(() => buildScanBatches(dataset), [dataset]);
  const [batchIndex, setBatchIndex] = useState(0);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [complete, setComplete] = useState(reducedMotion);

  useEffect(() => {
    if (reducedMotion || paused || complete) {
      return undefined;
    }

    const activePhase = SCAN_RITUAL_PHASES[phaseIndex];
    const timeoutId = window.setTimeout(() => {
      if (phaseIndex === SCAN_RITUAL_PHASES.length - 1) {
        if (batchIndex === batches.length - 1) {
          setComplete(true);
          return;
        }

        setBatchIndex((current) => current + 1);
        setPhaseIndex(0);
        return;
      }

      setPhaseIndex((current) => current + 1);
    }, activePhase.duration);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [batchIndex, batches.length, complete, paused, phaseIndex, reducedMotion, runVersion]);

  const activeBatch = batches[Math.min(batchIndex, batches.length - 1)];
  const currentPhase = reducedMotion
    ? { id: "complete" }
    : complete
      ? { id: "complete" }
      : SCAN_RITUAL_PHASES[phaseIndex];
  const completedBatchCount = reducedMotion || complete
    ? batches.length
    : batchIndex + (currentPhase.id === "settle" ? 1 : 0);
  const progress = summarizeScanProgress(batches, completedBatchCount);
  const queuedBatches = batches.slice(batchIndex + 1, batchIndex + 4);
  const visibleDiscoveryGroups = progress.discoveredGroups.slice(-SCAN_VISIBLE_DISCOVERY_LIMIT);
  const hiddenDiscoveryCount = Math.max(0, progress.discoveredGroups.length - visibleDiscoveryGroups.length);
  const phaseLabel = paused
    ? "Paused"
    : {
      arrive: "Incoming batch",
      inspect: "Scanning",
      transfer: "Processing batch",
      settle: "Discovery updated",
      complete: "Complete",
    }[currentPhase.id];

  return (
    <StageShell
      title="Watch Pidgeot work through your inbox."
      description="Representative batches move through the scanner, and completed work accumulates into sender structure and unsubscribe paths."
      footer={[
        <CompactStat key="messages" label="Messages discovered" value={progress.discoveredMessages.toLocaleString()} />,
        <CompactStat key="senders" label="Senders found" value={progress.discoveredSenders} />,
        <CompactStat key="unsubscribes" label="Unsubscribe paths" value={progress.unsubscribePaths} />,
      ]}
    >
      <div className="mb-5 flex flex-wrap gap-2">
        <button
          className={classNames(
            "rounded-full border px-4 py-2 text-sm",
            paused
              ? "border-cyan-300/30 bg-cyan-300/12 text-cyan-100"
              : "border-white/12 bg-white/4 text-slate-300 hover:border-white/24 hover:bg-white/6",
          )}
          onClick={() => setPaused((current) => !current)}
          type="button"
        >
          {paused ? "Resume scan" : "Pause scan"}
        </button>
      </div>

      <LayoutGroup>
        <div className="grid gap-4 xl:grid-cols-[1.18fr_0.82fr]">
          <div className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.1),transparent_26%),linear-gradient(180deg,rgba(7,12,22,0.96),rgba(4,8,17,0.98))] p-4 sm:p-5 lg:p-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Scan ritual</p>
                <p className="mt-1 text-sm text-slate-300">Mail arrives in batches, the lens inspects that batch, then completed work settles into the machine.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <CompactStat label="Status" value={phaseLabel} />
                <CompactStat label="Current batch" value={complete ? batches.length : batchIndex + 1} />
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[0.88fr_1.12fr]">
              <div className="rounded-[28px] border border-white/10 bg-[rgba(10,16,31,0.72)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-500">Incoming mail</p>
                    <p className="mt-1 text-sm text-slate-300">A representative window into the next mailbox chunk.</p>
                  </div>
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-400">{activeBatch.visibleCount} visible cards</span>
                </div>

                <div className="mt-4 grid gap-3">
                  <motion.div
                    layout
                    className="rounded-[24px] border border-white/8 bg-black/20 p-3"
                    animate={reducedMotion
                      ? { opacity: 1, x: 0, y: 0, scale: 1 }
                      : currentPhase.id === "arrive"
                        ? { opacity: 0.72, x: [-16, 0], y: [8, 0], scale: [0.97, 1] }
                        : currentPhase.id === "inspect"
                          ? { opacity: 1, x: 0, y: 0, scale: 1 }
                          : currentPhase.id === "transfer"
                            ? { opacity: 0.46, x: 88, y: 122, scale: 0.72 }
                            : currentPhase.id === "settle"
                              ? { opacity: 0.16, x: 100, y: 138, scale: 0.68 }
                              : { opacity: 0.36, x: 0, y: 0, scale: 0.96 }}
                    transition={reducedMotion ? { duration: 0 } : { duration: 0.6, ease: "easeInOut" }}
                  >
                    <div className="grid gap-3 sm:grid-cols-2">
                      {activeBatch.cards.slice(0, 6).map((message) => (
                        <MessageCard
                          key={message.id}
                          accentColor={message.color}
                          compact
                          preview={message.preview}
                          sender={message.group.label}
                          unread={message.unread}
                        />
                      ))}
                    </div>
                  </motion.div>

                  <div className="grid gap-2 sm:grid-cols-3">
                    {queuedBatches.map((batch) => (
                      <div key={batch.id} className="rounded-[20px] border border-white/8 bg-white/4 px-3 py-3">
                        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">{batch.label}</p>
                        <p className="mt-2 text-sm text-slate-200">{batch.visibleCount} visible cards</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] border border-white/10 bg-[rgba(10,16,31,0.8)] p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-500">Scanning / inspection</p>
                    <h3 className="mt-2 text-xl font-semibold text-white">{activeBatch.label}</h3>
                    <p className="mt-1 text-sm text-slate-400">{activeBatch.messageGain.toLocaleString()} discovered messages move through this pass.</p>
                  </div>
                  <motion.div
                    animate={paused
                      ? { x: 0, y: 0 }
                      : currentPhase.id === "arrive"
                        ? { x: -28, y: -12 }
                        : currentPhase.id === "inspect"
                          ? { x: 0, y: 0 }
                          : currentPhase.id === "transfer"
                            ? { x: 34, y: 8 }
                            : { x: 0, y: 0 }}
                    transition={reducedMotion ? { duration: 0 } : { duration: 0.58, ease: "easeInOut" }}
                  >
                    <LensGlyph mode={paused || currentPhase.id === "complete" ? "idle" : currentPhase.id === "inspect" ? "inspect" : "recognize"} />
                  </motion.div>
                </div>

                <div className="mt-5 rounded-[26px] border border-white/10 bg-black/18 p-4">
                  <div className="relative h-[296px] overflow-hidden rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-4">
                    <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 h-full w-full">
                      <path d="M 12 52 C 28 52, 36 34, 52 34 S 78 48, 90 72" fill="none" stroke="rgba(56,189,248,0.2)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
                    </svg>

                    <motion.div
                      className="absolute left-[10%] top-[18%] w-[72%]"
                      animate={reducedMotion
                        ? { x: 0, y: 0, opacity: 1, scale: 1 }
                        : currentPhase.id === "arrive"
                          ? { x: -14, y: 10, opacity: 0.72, scale: 0.96 }
                          : currentPhase.id === "inspect"
                            ? { x: 0, y: 0, opacity: 1, scale: 1 }
                            : currentPhase.id === "transfer"
                              ? { x: 138, y: 132, opacity: 0.42, scale: 0.62 }
                              : currentPhase.id === "settle"
                                ? { x: 154, y: 152, opacity: 0.08, scale: 0.54 }
                                : { x: 0, y: 0, opacity: 0.24, scale: 0.92 }}
                      transition={reducedMotion ? { duration: 0 } : { duration: 0.62, ease: "easeInOut" }}
                    >
                      <div className="grid gap-3 sm:grid-cols-2">
                        {activeBatch.cards.slice(0, 4).map((message) => (
                          <MessageCard
                            key={`ritual-${message.id}`}
                            accentColor={message.color}
                            compact
                            preview={message.preview}
                            sender={message.group.label}
                            unread={message.unread}
                          />
                        ))}
                      </div>
                    </motion.div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="rounded-[30px] border border-white/10 bg-[rgba(8,14,25,0.82)] p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Discovered structure</p>
                  <p className="mt-1 text-sm text-slate-300">Completed batches accumulate sender groups and unsubscribe paths.</p>
                </div>
                {hiddenDiscoveryCount > 0 ? (
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-400">+ {hiddenDiscoveryCount} more</span>
                ) : null}
              </div>

              <div className="mt-4 rounded-[22px] border border-white/8 bg-black/18 p-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">Sender groups emerging</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {visibleDiscoveryGroups.map((group) => (
                    <motion.span
                      key={`discovered-${group.id}`}
                      initial={reducedMotion ? false : { opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-full border border-white/10 bg-white/6 px-3 py-2 text-sm text-slate-100"
                    >
                      {group.label}
                    </motion.span>
                  ))}
                </div>
              </div>

              <div className="mt-4 rounded-[22px] border border-white/8 bg-black/18 p-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">Unsubscribe paths discovered</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {progress.discoveredPathLabels.length > 0 ? progress.discoveredPathLabels.map((label) => (
                    <motion.span
                      key={`path-${label}`}
                      initial={reducedMotion ? false : { opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-full border border-[#f4c95d]/24 bg-[#f4c95d]/12 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#fbe9b2]"
                    >
                      {label}
                    </motion.span>
                  )) : (
                    <span className="rounded-full border border-white/10 bg-white/6 px-3 py-2 text-sm text-slate-400">Waiting for unsubscribe signals</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </LayoutGroup>
    </StageShell>
  );
}

function CleanupRitualExperiment({ dataset, panelKey, reducedMotion }) {
  const [variant, setVariant] = useState("partial");
  const [studyId, setStudyId] = useState("broom");
  const scenario = useMemo(() => buildCleanupScenario(dataset, variant), [dataset, variant]);
  const cleanupCards = useMemo(() => distributeCleanupCards(buildCleanupCards(scenario.senders)), [scenario.senders]);
  const [hasStarted, setHasStarted] = useState(false);
  const [complete, setComplete] = useState(false);
  const [decrementIndex, setDecrementIndex] = useState(0);

  function resetRun(nextVariant = variant) {
    setVariant(nextVariant);
    setHasStarted(false);
    setComplete(false);
    setDecrementIndex(0);
  }

  function handleProcessSelected() {
    setHasStarted(true);
    setComplete(reducedMotion);
    setDecrementIndex(reducedMotion ? cleanupCards.length : 0);
  }

  useEffect(() => {
    if (!hasStarted || reducedMotion || complete) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setDecrementIndex((current) => {
        const next = current + 1;

        if (next >= cleanupCards.length) {
          setComplete(true);
          return cleanupCards.length;
        }

        return next;
      });
    }, studyId === "unsubscribe" ? 220 : 140);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [cleanupCards.length, complete, hasStarted, reducedMotion, studyId]);

  const removedCards = reducedMotion || complete ? cleanupCards.length : decrementIndex;
  const activeCards = cleanupCards.slice(removedCards);
  const totalUnread = scenario.totals.unread;
  const unreadCleared = cleanupCards.slice(0, removedCards).reduce((sum, card) => sum + card.unreadUnits, 0);
  const remainingUnread = Math.max(0, totalUnread - unreadCleared);
  const running = hasStarted && !complete && !reducedMotion;
  const surfaceLabel = complete ? "Clear space" : running ? "Cleanup" : "Clutter";
  const selectedStudy = CLEANUP_STUDIES.find((study) => study.id === studyId) || CLEANUP_STUDIES[0];
  const surfaceTone = studyId === "broom"
    ? "bg-[radial-gradient(circle_at_top,rgba(244,201,93,0.08),transparent_24%),linear-gradient(180deg,rgba(7,12,22,0.96),rgba(4,8,17,0.98))]"
    : studyId === "trash"
      ? "bg-[radial-gradient(circle_at_bottom_right,rgba(56,189,248,0.08),transparent_22%),linear-gradient(180deg,rgba(7,12,22,0.96),rgba(4,8,17,0.98))]"
      : studyId === "shredder"
        ? "bg-[radial-gradient(circle_at_80%_18%,rgba(244,201,93,0.08),transparent_22%),linear-gradient(180deg,rgba(7,12,22,0.96),rgba(4,8,17,0.98))]"
        : "bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.08),transparent_22%),linear-gradient(180deg,rgba(7,12,22,0.96),rgba(4,8,17,0.98))]";

  const cleanupSurface = studyId === "unsubscribe"
    ? (
      <CleanupUnsubscribeStudy
        complete={complete}
        reducedMotion={reducedMotion}
        running={running}
        senders={scenario.senders}
      />
    ) : (
      <div className="relative h-[420px] overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),transparent)]" />
        <div className="pointer-events-none absolute inset-x-[8%] bottom-[12%] h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.1),transparent)]" />
        {studyId === "broom" ? <CleanupSweepGlyph reducedMotion={reducedMotion} running={running || complete} /> : null}
        {studyId === "trash" ? <CleanupTrashCan active={running || complete} reducedMotion={reducedMotion} /> : null}
        {studyId === "shredder" ? <CleanupShredder active={running || complete} reducedMotion={reducedMotion} /> : null}
        {activeCards.map((card) => (
          <CleanupClutterCard
            key={`${panelKey}-${studyId}-${card.id}`}
            active={running || complete}
            card={card}
            reducedMotion={reducedMotion}
            studyId={studyId}
          />
        ))}
        {studyId === "broom" ? (
          <motion.div
            aria-hidden="true"
            className="absolute bottom-[8%] right-[7%] h-20 w-32 rounded-[22px] border border-white/10 bg-black/18"
            animate={reducedMotion
              ? { opacity: 1, scale: 1 }
              : running || complete
                ? { opacity: [0.84, 1, 0.94], scale: [1, 1.02, 1] }
                : { opacity: 0.84, scale: 1 }}
            transition={reducedMotion ? { duration: 0 } : { duration: 0.5, ease: "easeInOut" }}
          />
        ) : null}
      </div>
    );

  return (
    <StageShell
      title="Watch clutter clear from the inbox surface."
      description="Small visual studies compare what cleanup feels like: sweeping clutter away, dropping it into a bin, feeding it into a shredder, or removing the recurring relationship." 
      footer={[
        <CompactStat key="selected" label="Selected senders" value={scenario.senders.length} />,
        <CompactStat key="unread" label="Unread remaining" value={remainingUnread} />,
        <CompactStat key="surface" label="Surface" value={surfaceLabel} />,
      ]}
    >
      <div className="mb-5 flex flex-wrap gap-2">
        {Object.entries(CLEANUP_VARIANTS).map(([key, label]) => (
          <button
            key={key}
            className={classNames(
              "rounded-full border px-4 py-2 text-sm",
              variant === key
                ? "border-cyan-300/30 bg-cyan-300/12 text-cyan-100"
                : "border-white/12 bg-white/4 text-slate-300 hover:border-white/24 hover:bg-white/6",
            )}
            onClick={() => resetRun(key)}
            type="button"
          >
            {label}
          </button>
        ))}
        {CLEANUP_STUDIES.map((study) => (
          <button
            key={study.id}
            className={classNames(
              "rounded-full border px-4 py-2 text-sm",
              studyId === study.id
                ? "border-cyan-300/30 bg-cyan-300/12 text-cyan-100"
                : "border-white/12 bg-white/4 text-slate-300 hover:border-white/24 hover:bg-white/6",
            )}
            onClick={() => {
              setStudyId(study.id);
              setHasStarted(false);
              setComplete(false);
              setDecrementIndex(0);
            }}
            type="button"
          >
            {study.label}
          </button>
        ))}
        <button
          className="rounded-full bg-[#f4c95d] px-4 py-2 text-sm font-semibold text-slate-950"
          onClick={handleProcessSelected}
          type="button"
        >
          Process selected
        </button>
        <button
          className="rounded-full border border-white/12 bg-white/4 px-4 py-2 text-sm text-slate-300"
          onClick={() => resetRun(variant)}
          type="button"
        >
          Replay cleanup
        </button>
      </div>

      <LayoutGroup>
        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div className={classNames("rounded-[32px] border border-white/10 p-4 sm:p-5 lg:p-6", surfaceTone)}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Cleanup ritual</p>
                <p className="mt-1 text-sm text-slate-300">{selectedStudy.label}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <CompactStat label="Unread selected" value={totalUnread} />
                <CompactStat label="Unread cleared" value={totalUnread - remainingUnread} />
              </div>
            </div>

            <div className="mt-6 grid gap-4">
              {cleanupSurface}

              {studyId !== "unsubscribe" ? (
                <div className="flex items-center justify-between gap-4 rounded-[24px] border border-white/10 bg-[rgba(8,14,25,0.74)] px-4 py-3">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">Unread count</p>
                    <p className="mt-1 text-sm text-slate-300">The count drops only as cards actually leave the surface.</p>
                  </div>
                  <motion.div
                    key={`${studyId}-${remainingUnread}`}
                    initial={reducedMotion ? false : { opacity: 0.6, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="rounded-full border border-cyan-300/24 bg-cyan-300/10 px-4 py-2 text-lg font-semibold text-cyan-100"
                  >
                    {remainingUnread}
                  </motion.div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4">
            <div className="rounded-[30px] border border-white/10 bg-[rgba(8,14,25,0.82)] p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Selected senders</p>
                  <p className="mt-1 text-sm text-slate-300">The cleanup studies stay grounded in the exact senders selected from the decision surface.</p>
                </div>
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-400">{scenario.senders.length} selected</span>
              </div>

              <div className="mt-4 grid gap-3">
                {scenario.senders.map((entry) => (
                  <CleanupSenderTile
                    key={`cleanup-${entry.id}`}
                    compact
                    entry={entry}
                    reducedMotion={reducedMotion}
                    selected
                  />
                ))}
              </div>
            </div>

            <div className="rounded-[30px] border border-white/10 bg-[rgba(8,14,25,0.82)] p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Cleanup signals</p>
                  <p className="mt-1 text-sm text-slate-300">Minimal grounded numbers stay visible while the motion carries the meaning.</p>
                </div>
              </div>

              <div className="mt-4 grid gap-3">
                <div className="rounded-[22px] border border-white/8 bg-black/18 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">Unread selected</p>
                    <span className="text-sm font-semibold text-white">{totalUnread}</span>
                  </div>
                </div>
                <div className="rounded-[22px] border border-white/8 bg-black/18 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">Unread cleared</p>
                    <span className="text-sm font-semibold text-cyan-100">{totalUnread - remainingUnread}</span>
                  </div>
                </div>
                <div className="rounded-[22px] border border-white/8 bg-black/18 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">Auto unsubscribe</p>
                    <span className="text-sm font-semibold text-[#fbe9b2]">{scenario.totals.auto}</span>
                  </div>
                </div>
                <div className="rounded-[22px] border border-white/8 bg-black/18 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">Manual unsubscribe</p>
                    <span className="text-sm font-semibold text-cyan-100">{scenario.totals.manual}</span>
                  </div>
                </div>
                <div className="rounded-[22px] border border-white/8 bg-black/18 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">No unsubscribe path</p>
                    <span className="text-sm font-semibold text-slate-200">{scenario.totals.none}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </LayoutGroup>
    </StageShell>
  );
}

function DecisionSurfaceExperiment({ dataset, panelKey, reducedMotion }) {
  const decisionGroups = useMemo(() => buildDecisionGroups(dataset), [dataset]);
  const [settled, setSettled] = useState(reducedMotion);
  const [selectedIds, setSelectedIds] = useState([]);

  useEffect(() => {
    if (reducedMotion) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setSettled(true), DECISION_SETTLE_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [panelKey, reducedMotion]);

  const selectedGroups = decisionGroups.filter((group) => selectedIds.includes(group.id));
  const selectedUnread = selectedGroups.reduce((sum, group) => sum + group.unread, 0);
  const selectedOneClick = selectedGroups.filter((group) => group.mechanism.mode === "one-click").length;
  const selectedManual = selectedGroups.filter((group) => group.mechanism.tone === "manual").length;
  const trayVisible = selectedGroups.length > 0;

  function toggleSelection(groupId) {
    setSelectedIds((current) => (
      current.includes(groupId)
        ? current.filter((id) => id !== groupId)
        : [...current, groupId]
    ));
  }

  function handleSelectAllVisible() {
    setSelectedIds(decisionGroups.map((group) => group.id));
  }

  function handleClearSelection() {
    setSelectedIds([]);
  }

  return (
    <StageShell
      title="See which senders deserve action."
      description="Discovered sender groups settle into a working surface so you can choose what is worth unsubscribing from or moving to Trash."
      footer={[
        <CompactStat key="messages" label="Messages discovered" value={dataset.summary.messages.toLocaleString()} />,
        <CompactStat key="senders" label="Senders found" value={dataset.summary.senders} />,
        <CompactStat key="unsubscribe" label="Unsubscribe paths" value={dataset.summary.unsubscribeAvailable} />,
      ]}
    >
      <LayoutGroup>
        <div className="rounded-[30px] border border-white/10 bg-[rgba(8,14,25,0.82)] p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Decision surface</p>
              <p className="mt-1 text-sm text-slate-300">
                {settled ? "Here is what Pidgeot found. Your move." : "The Machine is handing discovered sender groups back to you."}
              </p>
            </div>
          </div>

          <AnimatePresence mode="wait" initial={false}>
            {trayVisible ? (
              <motion.div
                key="decision-command-active"
                initial={reducedMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reducedMotion ? undefined : { opacity: 0, y: -8 }}
                transition={{ duration: reducedMotion ? 0 : 0.22, ease: "easeOut" }}
                className="mt-4 flex flex-col gap-3 rounded-[22px] border border-white/8 bg-black/16 px-4 py-3 lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="min-w-0 text-sm text-slate-300">
                  <span className="font-semibold text-white">{selectedGroups.length} sender{selectedGroups.length === 1 ? "" : "s"} selected</span>
                  <span className="text-slate-500"> · </span>
                  <span>{selectedUnread} unread</span>
                  <span className="text-slate-500"> · </span>
                  <span>{selectedOneClick} one-click</span>
                  {selectedManual > 0 ? (
                    <>
                      <span className="text-slate-500"> · </span>
                      <span>{selectedManual} manual</span>
                    </>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="rounded-full border border-[#f4c95d]/24 bg-[#f4c95d]/12 px-4 py-2 text-sm font-medium text-[#fbe9b2] disabled:opacity-40"
                    disabled={selectedOneClick === 0}
                    type="button"
                  >
                    Unsubscribe {selectedOneClick > 0 ? selectedOneClick : ""}
                  </button>
                  <button
                    className="rounded-full border border-cyan-300/24 bg-cyan-300/12 px-4 py-2 text-sm font-medium text-cyan-100 disabled:opacity-40"
                    disabled={selectedUnread === 0}
                    type="button"
                  >
                    Move {selectedUnread > 0 ? selectedUnread : 0} to Trash
                  </button>
                  <button
                    className="rounded-full border border-white/12 bg-white/4 px-4 py-2 text-sm text-slate-300"
                    onClick={handleClearSelection}
                    type="button"
                  >
                    Clear selection
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="decision-command-idle"
                initial={reducedMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reducedMotion ? undefined : { opacity: 0, y: -8 }}
                transition={{ duration: reducedMotion ? 0 : 0.22, ease: "easeOut" }}
                className="mt-4 flex flex-wrap gap-2"
              >
                <button
                  className="rounded-full border border-white/12 bg-white/4 px-4 py-2 text-sm text-slate-300 hover:border-white/24 hover:bg-white/6"
                  onClick={handleSelectAllVisible}
                  type="button"
                >
                  Select all visible
                </button>
                <button
                  className="rounded-full border border-white/12 bg-white/4 px-4 py-2 text-sm text-slate-300 disabled:opacity-40"
                  disabled
                  type="button"
                >
                  Clear selection
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {decisionGroups.map((entry) => (
              <DecisionSenderCard
                key={`${panelKey}-${entry.id}`}
                entry={entry}
                expanded={settled || reducedMotion}
                onToggle={() => toggleSelection(entry.id)}
                reducedMotion={reducedMotion}
                selected={selectedIds.includes(entry.id)}
              />
            ))}
          </div>
        </div>
      </LayoutGroup>
    </StageShell>
  );
}

function MotionExperiment({ dataset, panelKey, reducedMotion }) {
  const [selectedGroupId, setSelectedGroupId] = useState(dataset.featuredGroups[0]?.id || null);
  const [sortMode, setSortMode] = useState("messages");

  const sortedGroups = useMemo(() => {
    const metricKey = {
      messages: "messageCount",
      trash: "trash",
      unread: "unread",
    }[sortMode];

    return [...dataset.featuredGroups].sort((left, right) => right[metricKey] - left[metricKey]);
  }, [dataset.featuredGroups, sortMode]);

  const selectedGroup = sortedGroups.find((group) => group.id === selectedGroupId) || sortedGroups[0];

  return (
    <StageShell
      title="Watch inbox piles reorganise."
      description="These are recurring senders Pidgeot discovered. Choose a sorting rule and the same sender cards settle into a new order."
      footer={[
        <CompactStat key="senders" label="Senders found" value={dataset.summary.senders} />,
        <CompactStat key="messages" label="Messages" value={dataset.summary.messages} />,
      ]}
    >
      <div className="mb-5 flex flex-wrap gap-2">
        {["messages", "unread", "trash"].map((mode) => (
          <button
            key={mode}
            className={classNames(
              "rounded-full border px-4 py-2 text-sm transition-colors",
              sortMode === mode
                ? "border-[#f4c95d] bg-[#f4c95d]/16 text-[#fbe9b2]"
                : "border-white/12 bg-white/4 text-slate-300 hover:border-white/28 hover:bg-white/7",
            )}
            onClick={() => setSortMode(mode)}
            type="button"
          >
            Sort by {mode}
          </button>
        ))}
      </div>

      <LayoutGroup>
        <div className="grid gap-4 xl:grid-cols-[1.28fr_0.72fr]">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {sortedGroups.map((group, index) => {
              const isSelected = group.id === selectedGroup?.id;

              return (
                <motion.button
                  key={`${panelKey}-${group.id}`}
                  layout
                  initial={reducedMotion ? false : { opacity: 0, y: 24 }}
                  animate={{ opacity: 1, scale: isSelected ? 1.02 : 1, y: 0 }}
                  transition={{
                    delay: reducedMotion ? 0 : index * 0.05,
                    duration: reducedMotion ? 0 : 0.45,
                    type: "spring",
                    stiffness: 180,
                    damping: 20,
                  }}
                  whileHover={reducedMotion ? undefined : { y: -3 }}
                  onClick={() => setSelectedGroupId(group.id)}
                  type="button"
                  className={classNames(
                    "rounded-[26px] border p-4 text-left shadow-[0_18px_40px_rgba(0,0,0,0.24)]",
                    isSelected
                      ? "border-white/28 bg-white/9"
                      : "border-white/10 bg-[rgba(9,16,31,0.88)]",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-slate-400">{group.category}</p>
                      <h3 className="mt-2 text-lg font-semibold text-white">{group.label}</h3>
                    </div>
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: group.color }} />
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-sm text-slate-200">
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">Messages</p>
                      <motion.p layout className="mt-1 text-xl font-semibold">{group.messageCount}</motion.p>
                    </div>
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">Unread</p>
                      <motion.p layout className="mt-1 text-xl font-semibold text-[#fbe9b2]">{group.unread}</motion.p>
                    </div>
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">Trash</p>
                      <motion.p layout className="mt-1 text-xl font-semibold text-cyan-100">{group.trash}</motion.p>
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>

          <motion.div layout className="rounded-[28px] bg-black/18 p-5 backdrop-blur-sm">
            <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-slate-400">Selected sender</p>
            <AnimatePresence mode="wait">
              <motion.div
                key={selectedGroup?.id}
                initial={reducedMotion ? false : { opacity: 0, x: 18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reducedMotion ? undefined : { opacity: 0, x: -18 }}
                transition={{ duration: reducedMotion ? 0 : 0.3 }}
                className="mt-4 space-y-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-2xl font-semibold text-white">{selectedGroup?.label}</h3>
                    <p className="mt-1 text-sm text-slate-400">{selectedGroup?.domain}</p>
                  </div>
                  <span className="rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-[0.18em] text-slate-300">
                    {selectedGroup?.attention} attention
                  </span>
                </div>
                <p className="text-sm leading-6 text-slate-300">{selectedGroup?.whySummary}</p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "messages", value: selectedGroup?.messageCount },
                    { label: "unread", value: selectedGroup?.unread },
                    { label: "one-click", value: selectedGroup?.unsubscribeAvailable ? "available" : "manual" },
                  ].map((item) => (
                    <div key={item.label} className="rounded-[20px] bg-white/5 p-3">
                      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                      <p className="mt-2 text-xl font-semibold text-white">{item.value}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            </AnimatePresence>
          </motion.div>
        </div>
      </LayoutGroup>
    </StageShell>
  );
}

function ClusterExperiment({ dataset, panelKey, reducedMotion }) {
  const [grouped, setGrouped] = useState(reducedMotion);
  const wells = dataset.featuredGroups.slice(0, 5);
  const clusterMessages = buildSemanticMessages(dataset, 10);

  return (
    <StageShell
      title="Watch chaos become structure."
      description="Toggle between scatter and grouped to see the same messages pulled into visible sender piles."
      footer={[
        <CompactStat key="messages" label="Messages in play" value={clusterMessages.length} />,
        <CompactStat key="clusters" label="Visible clusters" value={wells.length} />,
      ]}
    >
      <div className="mb-5 flex flex-wrap gap-2">
        <button
          className={classNames(
            "rounded-full border px-4 py-2 text-sm",
            !grouped ? "border-[#f4c95d] bg-[#f4c95d]/16 text-[#fbe9b2]" : "border-white/12 bg-white/4 text-slate-300",
          )}
          onClick={() => setGrouped(false)}
          type="button"
        >
          Scatter
        </button>
        <button
          className={classNames(
            "rounded-full border px-4 py-2 text-sm",
            grouped ? "border-cyan-300 bg-cyan-300/14 text-cyan-100" : "border-white/12 bg-white/4 text-slate-300",
          )}
          onClick={() => setGrouped(true)}
          type="button"
        >
          Group by sender
        </button>
      </div>

      <div className="relative h-[520px] overflow-hidden rounded-[36px] bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.12),transparent_24%),linear-gradient(180deg,rgba(6,12,24,0.98),rgba(5,9,18,0.98))]">
        {grouped
          ? wells.map((group, index) => (
            <div
              key={group.id}
              className="absolute rounded-full border border-white/10 bg-white/4 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.22em] text-white/85"
              style={{
                left: `${10 + (index % 3) * 30}%`,
                top: `${10 + Math.floor(index / 3) * 46}%`,
              }}
            >
              {group.label}
            </div>
          ))
          : null}

        {clusterMessages.map((message, index) => {
          const groupIndex = wells.findIndex((group) => group.id === message.group.id);
          const scatteredX = 6 + (index % 3) * 22 + ((index % 2) * 4);
          const scatteredY = 10 + Math.floor(index / 3) * 17 + ((index % 2) * 2);
          const groupedX = 8 + (Math.max(groupIndex, 0) % 3) * 30;
          const groupedY = 18 + Math.floor(Math.max(groupIndex, 0) / 3) * 46 + ((index % 2) * 9);

          return (
            <motion.div
              key={`${panelKey}-${message.id}`}
              className="absolute"
              initial={reducedMotion ? false : { opacity: 0, scale: 0.86 }}
              animate={{
                opacity: 1,
                left: `${grouped ? groupedX : scatteredX}%`,
                top: `${grouped ? groupedY : scatteredY}%`,
                scale: grouped ? 0.86 : 1,
              }}
              transition={{
                delay: reducedMotion ? 0 : index * 0.04,
                duration: reducedMotion ? 0 : 0.65,
                type: "spring",
                stiffness: 120,
                damping: 17,
              }}
            >
              <MessageCard
                accentColor={message.color}
                compact
                preview={message.preview}
                sender={message.group.label}
                unread={message.unread}
              />
            </motion.div>
          );
        })}
      </div>
    </StageShell>
  );
}

function DeveloperInspector({ controls, dataset, onChange, reducedMotion }) {
  return (
    <details className="rounded-[24px] border border-white/10 bg-black/20 p-4">
      <summary className="cursor-pointer list-none font-mono text-[11px] uppercase tracking-[0.24em] text-slate-400">
        Developer inspector
      </summary>
      <div className="mt-4 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="grid gap-4">
          {[
            { key: "messages", label: "Messages", min: 1000, max: 10000, step: 250 },
            { key: "senders", label: "Senders", min: 12, max: 100, step: 1 },
            { key: "newsletters", label: "Newsletters", min: 4, max: 60, step: 1 },
            { key: "promotional", label: "Promotional", min: 4, max: 60, step: 1 },
            { key: "notifications", label: "Notifications", min: 4, max: 40, step: 1 },
            { key: "unsubscribeAvailable", label: "One-click ready", min: 4, max: 60, step: 1 },
            { key: "seed", label: "Seed", min: 1, max: 99, step: 1 },
          ].map((control) => (
            <label key={control.key} className="grid gap-2">
              <div className="flex items-center justify-between gap-3 text-sm text-slate-200">
                <span>{control.label}</span>
                <span className="font-mono text-xs text-slate-400">{controls[control.key]}</span>
              </div>
              <input
                className="accent-[#f4c95d]"
                max={control.max}
                min={control.min}
                onChange={(event) => onChange(control.key, Number(event.target.value))}
                step={control.step}
                type="range"
                value={controls[control.key]}
              />
            </label>
          ))}
        </div>
        <div className="grid gap-3">
          <div className="rounded-[20px] bg-white/5 p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">Reduced motion</p>
            <p className="mt-2 text-sm text-white">{reducedMotion ? "Active" : "Inactive"}</p>
          </div>
          <div className="rounded-[20px] bg-white/5 p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">Summary</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-slate-300">
              {Object.entries(dataset.summary).map(([label, value]) => (
                <div key={label} className="rounded-[16px] bg-black/20 px-3 py-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">{formatLabel(label)}</span>
                  <p className="mt-1 text-white">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </details>
  );
}

function StageNavigation({ activeExperiment, onSelect }) {
  return (
    <nav aria-label="Playground experiments" className="overflow-x-auto pb-1">
      <div className="flex min-w-max gap-2">
        {EXPERIMENTS.map((experiment, index) => (
          <button
            key={experiment.id}
            className={classNames(
              "rounded-full border px-4 py-2 text-left transition-colors",
              activeExperiment === experiment.id
                ? "border-cyan-300/40 bg-cyan-300/12 text-cyan-50"
                : "border-white/10 bg-white/4 text-slate-300 hover:border-white/24 hover:bg-white/6",
            )}
            onClick={() => onSelect(experiment.id)}
            type="button"
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">0{index + 1}</span>
            <span className="ml-2 text-sm font-medium">{experiment.shortLabel}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

export function PlaygroundLab() {
  const prefersReducedMotion = useReducedMotion();
  const [controls, setControls] = useState(DEFAULT_PLAYGROUND_CONTROLS);
  const [activeExperiment, setActiveExperiment] = useState(EXPERIMENTS[0].id);
  const [labRun, setLabRun] = useState(0);
  const [experimentResetKey, setExperimentResetKey] = useState(0);
  const [forceReducedMotion, setForceReducedMotion] = useState(false);
  const reducedMotion = prefersReducedMotion || forceReducedMotion;
  const dataset = useMemo(() => createPlaygroundDataset(controls), [controls]);
  const panelKey = `${activeExperiment}-${labRun}-${experimentResetKey}-${dataset.controls.seed}`;
  const experiment = getExperimentById(activeExperiment);

  function handleControlChange(key, value) {
    setControls((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function renderActiveExperiment() {
    switch (activeExperiment) {
      case "machine":
        return <PidgeotMachineExperiment key={`${panelKey}-${reducedMotion ? "reduced" : "motion"}`} dataset={dataset} panelKey={panelKey} reducedMotion={reducedMotion} runVersion={labRun + experimentResetKey} />;
      case "scan":
        return <ScanRitualExperiment key={`${panelKey}-${reducedMotion ? "reduced" : "motion"}`} dataset={dataset} panelKey={panelKey} reducedMotion={reducedMotion} runVersion={labRun + experimentResetKey} />;
      case "decision":
        return <DecisionSurfaceExperiment key={panelKey} dataset={dataset} panelKey={panelKey} reducedMotion={reducedMotion} />;
      case "cleanup":
        return <CleanupRitualExperiment key={`${panelKey}-${reducedMotion ? "reduced" : "motion"}`} dataset={dataset} panelKey={panelKey} reducedMotion={reducedMotion} />;
      case "reference":
        return <AnimationReferenceLab key={`${panelKey}-${reducedMotion ? "reduced" : "motion"}`} reducedMotion={reducedMotion} />;
      case "motion":
        return <MotionExperiment key={panelKey} dataset={dataset} panelKey={panelKey} reducedMotion={reducedMotion} />;
      case "clusters":
        return <ClusterExperiment key={panelKey} dataset={dataset} panelKey={panelKey} reducedMotion={reducedMotion} />;
      default:
        return null;
    }
  }

  return (
    <main className="machine-shell min-h-screen px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-[1540px] flex-col gap-4 lg:gap-5">
        <section className="rounded-[34px] border border-white/10 bg-[rgba(6,12,23,0.82)] px-4 py-5 shadow-[0_24px_80px_rgba(0,0,0,0.32)] backdrop-blur md:px-6 md:py-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-cyan-100/70">Phase 6A visual laboratory</p>
              <h1 className="mt-2 text-4xl font-semibold tracking-[-0.06em] text-white sm:text-5xl">Strange little machines.</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                One experiment owns the stage at a time. Press a machine, watch it move, and decide whether the idea feels clear.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="rounded-full bg-[#f4c95d] px-4 py-2 text-sm font-semibold text-slate-950" onClick={() => setLabRun((current) => current + 1)} type="button">
                Replay
              </button>
              <button className="rounded-full border border-white/12 bg-white/4 px-4 py-2 text-sm text-slate-300" onClick={() => setExperimentResetKey((current) => current + 1)} type="button">
                Reset stage
              </button>
              <button
                className="rounded-full border border-white/12 bg-white/4 px-4 py-2 text-sm text-slate-300"
                onClick={() => {
                  setControls(DEFAULT_PLAYGROUND_CONTROLS);
                  setLabRun((current) => current + 1);
                  setExperimentResetKey((current) => current + 1);
                }}
                type="button"
              >
                Reset lab
              </button>
              <button
                aria-pressed={reducedMotion}
                className={classNames(
                  "rounded-full border px-4 py-2 text-sm",
                  reducedMotion
                    ? "border-emerald-300/30 bg-emerald-300/12 text-emerald-100"
                    : "border-white/12 bg-white/4 text-slate-300",
                )}
                onClick={() => setForceReducedMotion((current) => !current)}
                type="button"
              >
                Reduced motion {reducedMotion ? "on" : "off"}
              </button>
              <Link href="/" className="rounded-full border border-white/12 bg-white/4 px-4 py-2 text-sm text-slate-300 hover:border-white/24 hover:bg-white/6">
                Exit lab
              </Link>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <StageNavigation activeExperiment={activeExperiment} onSelect={setActiveExperiment} />
            <div className="flex flex-wrap gap-2">
              <CompactStat label="Current experiment" value={experiment.shortLabel} />
              <CompactStat label="Deterministic seed" value={dataset.controls.seed} />
            </div>
          </div>
        </section>

        <AnimatePresence mode="wait">
          <motion.div
            key={panelKey}
            initial={reducedMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducedMotion ? undefined : { opacity: 0, y: -10 }}
            transition={{ duration: reducedMotion ? 0 : 0.24 }}
          >
            {renderActiveExperiment()}
          </motion.div>
        </AnimatePresence>

        <DeveloperInspector
          controls={controls}
          dataset={dataset}
          onChange={handleControlChange}
          reducedMotion={reducedMotion}
        />
      </div>
    </main>
  );
}
