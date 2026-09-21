"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";

import { SENDER_CATEGORIES } from "@/lib/classification/constants";
import { SCAN_STATES } from "@/lib/scanning/constants";

import {
  ACTIVE_SCAN_STATES,
  derivePresentation,
  deriveRitualStage,
  formatLabel,
  getGroupTitle,
  getUnsubscribeLabel,
} from "@/components/scan/production-scan-model";

function classNames(...items) {
  return items.filter(Boolean).join(" ");
}

const CATEGORY_FILTER_OPTIONS = [
  SENDER_CATEGORIES.NEWSLETTER,
  SENDER_CATEGORIES.PROMOTIONAL,
  SENDER_CATEGORIES.SOCIAL,
  SENDER_CATEGORIES.NOTIFICATION,
  SENDER_CATEGORIES.TRANSACTIONAL,
  SENDER_CATEGORIES.UPDATES,
  SENDER_CATEGORIES.UNKNOWN,
];

const CATEGORY_TOOLTIPS = {
  [SENDER_CATEGORIES.NEWSLETTER]: "Recurring email sent as a newsletter.",
  [SENDER_CATEGORIES.PROMOTIONAL]: "Recurring promotional or marketing email.",
  [SENDER_CATEGORIES.SOCIAL]: "Email related to social activity or platforms.",
  [SENDER_CATEGORIES.NOTIFICATION]: "Automated notification rather than a subscription.",
  [SENDER_CATEGORIES.TRANSACTIONAL]: "Email related to a transaction, account, or service event.",
  [SENDER_CATEGORIES.UPDATES]: "Recurring service or product updates.",
  [SENDER_CATEGORIES.UNKNOWN]: "Pidgeot could not confidently classify this sender.",
};

const ATTENTION_TOOLTIPS = {
  HIGH: "Based on observable inbox behavior, not a recommendation.",
  MEDIUM: "Based on observable inbox behavior, not a recommendation.",
  LOW: "Based on observable inbox behavior, not a recommendation.",
};

const ACTIONABILITY_TOOLTIPS = {
  AUTOMATIC: "Pidgeot found a supported one-click unsubscribe mechanism.",
  "Cleanup candidate": "Pidgeot found a sender with an available cleanup path.",
  "Discovery only": "Pidgeot found this sender, but there is currently no cleanup action available.",
  "Sensitive mail": "This sender is kept out of cleanup because it appears to be financial or otherwise sensitive.",
};

function getAttentionTone(attention) {
  if (attention === "HIGH") {
    return "border-[#f4c95d]/28 bg-[#f4c95d]/12 text-[#fbe9b2]";
  }

  if (attention === "MEDIUM") {
    return "border-cyan-300/24 bg-cyan-300/12 text-cyan-100";
  }

  return "border-white/10 bg-white/6 text-slate-300";
}

function getUnsubscribeTone(unsubscribe) {
  if (unsubscribe?.resolutionStatus === "AUTOMATIC" || unsubscribe?.resolutionStatus === "ONE_CLICK_READY") {
    return "border-[#f4c95d]/24 bg-[#f4c95d]/12 text-[#fbe9b2]";
  }

  if (unsubscribe?.resolutionStatus === "MANUAL_ACTION_REQUIRED") {
    return "border-cyan-300/24 bg-cyan-300/12 text-cyan-100";
  }

  return "border-white/10 bg-white/6 text-slate-400";
}

function formatCount(value) {
  return Number.isFinite(value) ? value.toLocaleString() : null;
}

function formatQuantity(value, singular, plural = `${singular}s`) {
  if (!Number.isFinite(value)) {
    return null;
  }

  return `${formatCount(value)} ${value === 1 ? singular : plural}`;
}

const SENSITIVE_DISCOVERY_PATTERNS = ["bank", "banking", "card", "cards", "statement", "statements"];

function normalizeSurfaceToken(value) {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function isSensitiveFinancialGroup(group) {
  const corpus = [
    group?.displayName,
    ...(Array.isArray(group?.displayNames) ? group.displayNames : []),
    group?.representativeAddress,
    group?.representativeDomain,
    ...(Array.isArray(group?.senderDomains) ? group.senderDomains : []),
  ]
    .filter(Boolean)
    .map(normalizeSurfaceToken);

  return SENSITIVE_DISCOVERY_PATTERNS.some(
    (pattern) => corpus.some((value) => value.includes(pattern)),
  );
}

function isCleanupCandidate(group) {
  return Boolean(group?.cleanupCandidate) && !isSensitiveFinancialGroup(group);
}

function getActionabilityLabel(group, selected) {
  if (selected) {
    return "Selected";
  }

  if (isSensitiveFinancialGroup(group)) {
    return "Sensitive mail";
  }

  if (isCleanupCandidate(group)) {
    return "Cleanup candidate";
  }

  return "Discovery only";
}

function getActionabilityTooltip(label, unsubscribe) {
  if (label === "Selected") {
    return null;
  }

  if (label === "Cleanup candidate" && unsubscribe?.resolutionStatus === "AUTOMATIC") {
    return ACTIONABILITY_TOOLTIPS.AUTOMATIC;
  }

  return ACTIONABILITY_TOOLTIPS[label] || null;
}

function sortGroupsByUnread(groups, sortMode) {
  if (sortMode === "discovery") {
    return groups;
  }

  const direction = sortMode === "unread-asc" ? 1 : -1;

  return [...groups]
    .map((group, index) => ({ group, index }))
    .sort((left, right) => {
      const unreadDifference = ((left.group.unreadCount || 0) - (right.group.unreadCount || 0)) * direction;

      if (unreadDifference !== 0) {
        return unreadDifference;
      }

      return left.index - right.index;
    })
    .map((entry) => entry.group);
}

function orderGroupsBySnapshot(groups, orderedIds) {
  if (!orderedIds || orderedIds.length === 0) {
    return groups;
  }

  const orderIndexById = new Map(orderedIds.map((id, index) => [id, index]));

  return [...groups]
    .map((group, index) => ({
      group,
      index,
      snapshotIndex: orderIndexById.has(group.id) ? orderIndexById.get(group.id) : Number.POSITIVE_INFINITY,
    }))
    .sort((left, right) => {
      if (left.snapshotIndex !== right.snapshotIndex) {
        return left.snapshotIndex - right.snapshotIndex;
      }

      return left.index - right.index;
    })
    .map((entry) => entry.group);
}

function TooltipTag({ children, className, description }) {
  return (
    <span className="group/tooltip relative inline-flex">
      <span
        className={className}
        tabIndex={description ? 0 : undefined}
      >
        {children}
      </span>
      {description ? (
        <span
          className="pointer-events-none absolute left-0 top-[calc(100%+0.5rem)] z-20 w-56 rounded-2xl border border-white/12 bg-[rgba(7,11,19,0.96)] px-3 py-2 text-xs leading-5 text-slate-200 opacity-0 shadow-[0_18px_40px_rgba(0,0,0,0.32)] transition-opacity duration-150 group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100"
          role="tooltip"
        >
          {description}
        </span>
      ) : null}
    </span>
  );
}

function getReviewableGroupCount(senderGroups) {
  return senderGroups.filter((group) => isCleanupCandidate(group)).length;
}

function DiscoveryFact({ children }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
      {children}
    </div>
  );
}

function CounterBadge({ label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
      <span className="block font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</span>
      <motion.span
        key={`${label}-${value}`}
        className="mt-1 block text-sm font-semibold text-white"
        initial={{ opacity: 0.45, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
      >
        {value}
      </motion.span>
    </div>
  );
}

function ScanLens({ mode, reducedMotion }) {
  const active = mode === "scanning";

  return (
    <div className={classNames(
      "relative h-24 w-24 rounded-full border border-white/14 bg-[radial-gradient(circle_at_34%_34%,rgba(255,255,255,0.34),rgba(255,255,255,0.07)_38%,rgba(56,189,248,0.16)_62%,rgba(0,0,0,0)_76%)]",
      mode === "error"
        ? "shadow-[0_0_0_1px_rgba(251,113,133,0.22),0_14px_34px_rgba(0,0,0,0.18)]"
        : mode === "settled"
          ? "shadow-[0_0_0_1px_rgba(74,222,128,0.18),0_14px_34px_rgba(0,0,0,0.18)]"
          : "shadow-[0_14px_34px_rgba(0,0,0,0.18)]",
    )}>
      <div className="absolute inset-[14px] rounded-full border border-white/18" />
      <motion.div
        className="absolute left-[18px] right-[18px] h-px bg-[#f4c95d]/72"
        animate={reducedMotion
          ? { opacity: active ? 0.82 : 0.34, top: 46 }
          : active
            ? { opacity: [0.18, 0.92, 0.18], top: [24, 66, 24] }
            : { opacity: mode === "paused" ? 0.2 : 0.46, top: 46 }}
        transition={reducedMotion ? { duration: 0 } : { duration: 0.74, repeat: active ? Infinity : 0, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute inset-[24px] rounded-full border border-cyan-300/24"
        animate={reducedMotion
          ? { opacity: 1, scale: 1 }
          : active
            ? { opacity: [0.5, 1, 0.5], scale: [1, 1.06, 1] }
            : mode === "settled"
              ? { opacity: 1, scale: 1 }
              : { opacity: 0.55, scale: 1 }}
        transition={reducedMotion ? { duration: 0 } : { duration: 0.42, repeat: active ? Infinity : 0, ease: "easeInOut" }}
      />
      <div className="absolute bottom-[-20px] right-1 h-10 w-3 rotate-[-34deg] rounded-full bg-white/12" />
    </div>
  );
}

function RitualStageRail({ reducedMotion, scan, settled }) {
  const currentStage = deriveRitualStage(scan);
  const stages = ["DISCOVERING", "GROUPING", "CLASSIFYING", "READY"];
  const currentIndex = currentStage ? stages.indexOf(currentStage) : -1;

  if (currentIndex === -1) {
    return null;
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {stages.map((stage, index) => {
        const active = index === currentIndex;
        const complete = index < currentIndex;

        return (
          <motion.span
            key={stage}
            className={classNames(
              "flex min-h-[52px] items-center justify-center rounded-2xl border px-4 py-3 text-center font-mono text-[10px] uppercase tracking-[0.22em]",
              active
                ? "border-cyan-300/28 bg-cyan-300/12 text-cyan-100 shadow-[0_0_0_1px_rgba(56,189,248,0.08)]"
                : complete
                  ? "border-white/12 bg-white/8 text-slate-200"
                  : "border-white/8 bg-black/16 text-slate-500",
            )}
            animate={reducedMotion || settled ? undefined : active ? { y: [0, -2, 0] } : { y: 0 }}
            transition={reducedMotion || settled ? undefined : active ? { duration: 2.8, repeat: Infinity, ease: "easeInOut" } : undefined}
          >
            {formatLabel(stage)}
          </motion.span>
        );
      })}
    </div>
  );
}

function ScanRitualSurface({ mode, reducedMotion, scan, senderGroups }) {
  const sourceSummaries = scan?.sourceSummaries || {};
  const incomingChips = [
    Number.isFinite(scan?.counters?.messagesDiscovered)
      ? `${formatQuantity(scan.counters.messagesDiscovered, "message")} seen`
      : null,
    Number.isFinite(sourceSummaries?.ACTIVE_MAIL?.messagesDiscovered) && sourceSummaries.ACTIVE_MAIL.messagesDiscovered > 0
      ? `${formatQuantity(sourceSummaries.ACTIVE_MAIL.messagesDiscovered, "message")} from inbox`
      : null,
    Number.isFinite(sourceSummaries?.TRASH?.messagesDiscovered) && sourceSummaries.TRASH.messagesDiscovered > 0
      ? `${formatQuantity(sourceSummaries.TRASH.messagesDiscovered, "message")} from trash`
      : null,
    Number.isFinite(scan?.counters?.pagesProcessed) && scan.counters.pagesProcessed > 0
      ? `${formatQuantity(scan.counters.pagesProcessed, "page")} checked`
      : null,
  ].filter(Boolean).slice(0, 4);

  const previewGroups = senderGroups.slice(0, 4);
  const active = mode === "scanning";

  return (
    <div className="rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.08),transparent_24%),rgba(8,14,25,0.84)] p-5">
      <div className="grid gap-5 lg:grid-cols-[0.9fr_auto_1.1fr] lg:items-center">
        <div className="flex min-w-0 flex-col gap-3">
          {incomingChips.length > 0 ? incomingChips.map((chip, index) => (
            <motion.div
              key={chip}
              data-scan-ritual-chip={chip}
              className={classNames(
                "w-fit rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200",
                index % 2 === 0 ? "self-start" : "self-end",
              )}
              initial={reducedMotion ? false : { opacity: 0, x: -14 }}
              animate={
                reducedMotion
                  ? { opacity: 1, x: 0, y: 0 }
                  : active
                    ? { opacity: [0.78, 1, 0.84, 1], x: [0, 8, 2, 0], y: [0, index % 2 === 0 ? -2 : 2, 0] }
                    : { opacity: 1, x: 0, y: 0 }
              }
              transition={{ duration: reducedMotion ? 0 : active ? 4.2 : 0.35, delay: reducedMotion ? 0 : index * 0.06, ease: "easeInOut", repeat: reducedMotion || !active ? 0 : Infinity }}
            >
              {chip}
            </motion.div>
          )) : (
            <div className="rounded-[22px] border border-dashed border-white/10 bg-black/16 px-4 py-8 text-sm text-slate-500">
              Start the scan and Pidgeot will begin surfacing what it finds here.
            </div>
          )}
        </div>

        <div className="flex justify-center">
          <ScanLens mode={mode} reducedMotion={reducedMotion} />
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          {previewGroups.length > 0 ? previewGroups.map((group, index) => (
            <motion.div
              key={`ritual-${group.id}`}
              data-scan-ritual-card={group.id}
              className="min-h-[132px] rounded-[20px] border border-white/8 bg-black/18 px-4 py-4"
              initial={reducedMotion ? false : { opacity: 0, x: 18, y: 10 }}
              animate={
                reducedMotion
                  ? { opacity: 1, x: 0, y: 0 }
                  : active
                    ? { opacity: 1, x: [10, 0], y: [6, 0] }
                    : { opacity: 1, x: 0, y: 0 }
              }
              transition={{ duration: reducedMotion ? 0 : active ? 0.7 : 0.28, delay: reducedMotion ? 0 : 0.08 + index * 0.07, ease: "easeOut" }}
            >
              <p className="text-sm font-semibold text-white">{getGroupTitle(group)}</p>
              <p className="mt-1 text-xs text-slate-400">{group.representativeAddress || "Representative address resolving"}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
                <span>{formatQuantity(group.messageCount || 0, "message")}</span>
                <span>{formatQuantity(group.unreadCount || 0, "unread item", "unread items")}</span>
                {group.category && group.category !== "UNKNOWN" ? <span>{formatLabel(group.category)}</span> : null}
              </div>
            </motion.div>
          )) : (
            <div className="rounded-[22px] border border-dashed border-white/10 bg-black/16 px-4 py-8 text-sm text-slate-500">
              Sender groups will appear here as soon as Pidgeot finds them.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SenderGroupCard({ group, reducedMotion, selected, onToggle }) {
  const title = getGroupTitle(group);
  const domainChips = group.senderDomains.slice(0, 3);
  const sensitiveFinancial = isSensitiveFinancialGroup(group);
  const cleanupCandidate = isCleanupCandidate(group);
  const statusLabel = getActionabilityLabel(group, selected);
  const statusTooltip = getActionabilityTooltip(statusLabel, group.unsubscribe);

  return (
    <motion.div
      layout
      aria-disabled={!cleanupCandidate}
      aria-pressed={cleanupCandidate ? selected : undefined}
      className={classNames(
        "h-full min-h-[272px] w-full rounded-[26px] border bg-[rgba(8,14,25,0.86)] p-4 text-left shadow-[0_16px_34px_rgba(0,0,0,0.16)] transition-colors",
        selected
          ? "border-cyan-300/32"
          : cleanupCandidate
            ? "border-white/10"
            : sensitiveFinancial
              ? "border-amber-300/16 bg-[rgba(18,15,10,0.78)]"
              : "border-white/6 bg-[rgba(8,14,25,0.68)]",
        cleanupCandidate ? "cursor-pointer" : "cursor-default",
      )}
      onClick={cleanupCandidate ? onToggle : undefined}
      onKeyDown={cleanupCandidate ? (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onToggle();
        }
      } : undefined}
      role={cleanupCandidate ? "button" : undefined}
      tabIndex={cleanupCandidate ? 0 : -1}
      whileTap={reducedMotion ? undefined : { scale: 0.99 }}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">sender group</p>
            <div className="mt-2 min-h-[56px] overflow-hidden">
              <h3 className="text-lg font-semibold leading-7 text-white">{title}</h3>
            </div>
            <p className="mt-1 truncate text-sm text-slate-400">{group.representativeAddress || "Representative address unavailable"}</p>
          </div>
          <TooltipTag
            className={classNames(
              "shrink-0 rounded-full border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em]",
              selected
                ? "border-cyan-300/28 bg-cyan-300/12 text-cyan-100"
                : sensitiveFinancial
                  ? "border-amber-300/22 bg-amber-300/10 text-amber-100"
                  : cleanupCandidate
                    ? "border-white/10 bg-white/6 text-slate-300"
                    : "border-white/8 bg-black/18 text-slate-400",
            )}
            description={statusTooltip}
          >
            {statusLabel}
          </TooltipTag>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/8 pt-4 text-sm">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">Messages</p>
            <p className="mt-1 font-semibold text-white">{group.messageCount}</p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">Unread</p>
            <p className="mt-1 font-semibold text-white">{group.unreadCount}</p>
          </div>
        </div>

        <div className="mt-3 min-h-[60px] overflow-hidden">
          <div className="flex flex-wrap gap-2">
            {group.category ? (
              <TooltipTag
                className="rounded-full border border-white/10 bg-white/6 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-100"
                description={CATEGORY_TOOLTIPS[group.category]}
              >
                {formatLabel(group.category)}
              </TooltipTag>
            ) : null}
            {group.attention ? (
              <TooltipTag
                className={classNames(
                  "rounded-full border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em]",
                  getAttentionTone(group.attention),
                )}
                description={ATTENTION_TOOLTIPS[group.attention]}
              >
                {formatLabel(group.attention)} attention
              </TooltipTag>
            ) : null}
            <TooltipTag
              className={classNames(
                "rounded-full border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em]",
                getUnsubscribeTone(group.unsubscribe),
              )}
              description={ACTIONABILITY_TOOLTIPS[group.unsubscribe?.resolutionStatus] || null}
            >
              {getUnsubscribeLabel(group.unsubscribe)}
            </TooltipTag>
          </div>
        </div>

        <div className="mt-auto min-h-[48px] pt-4">
          {domainChips.length > 0 ? (
            <div className="flex flex-wrap gap-2 overflow-hidden">
              {domainChips.map((domain) => (
                <span key={`${group.id}-${domain}`} className="inline-flex rounded-full border border-white/10 bg-white/6 px-3 py-2 text-sm text-slate-300">
                  {domain}
                </span>
              ))}
            </div>
          ) : (
            <span className="inline-flex rounded-full border border-white/10 bg-white/6 px-3 py-2 text-sm text-slate-500">
              Domain resolving
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

async function readJson(url, options) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options?.headers || {}),
    },
  });
  const payload = await response.json();

  if (!response.ok) {
    const error = new Error(payload?.error?.message || "Request failed.");
    error.code = payload?.error?.code || "request_failed";
    throw error;
  }

  return payload;
}

export function ProductionScanScreen({ authConfigured, autoAdvance = true, email, gmailAuthState, initialScan }) {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const [scan, setScan] = useState(initialScan);
  const [errorMessage, setErrorMessage] = useState(null);
  const [requestState, setRequestState] = useState("idle");
  const [selectedIds, setSelectedIds] = useState([]);
  const [pausePhase, setPausePhase] = useState(null);
  const [sortMode, setSortMode] = useState("discovery");
  const [categoryFilters, setCategoryFilters] = useState([]);
  const [activeSortSnapshot, setActiveSortSnapshot] = useState(null);
  const autoAdvanceVersionRef = useRef(0);
  const pauseStabilityRef = useRef({ lastUpdatedAt: null, stableReads: 0 });

  const senderGroups = scan?.senderGroups || [];
  const activeScan = Boolean(scan && ACTIVE_SCAN_STATES.has(scan.state) && pausePhase !== "settling");
  const filteredGroups = categoryFilters.length === 0
    ? senderGroups
    : senderGroups.filter((group) => categoryFilters.includes(group.category || SENDER_CATEGORIES.UNKNOWN));
  const visibleGroups = sortMode === "discovery"
    ? filteredGroups
    : activeScan
      ? orderGroupsBySnapshot(filteredGroups, activeSortSnapshot)
      : sortGroupsByUnread(filteredGroups, sortMode);
  const visibleSelectedIds = selectedIds.filter((id) => visibleGroups.some((group) => group.id === id && isCleanupCandidate(group)));
  const reviewableGroupCount = getReviewableGroupCount(senderGroups);
  const presentation = derivePresentation(scan, gmailAuthState);
  const pausing = pausePhase === "settling";
  const effectivePresentation = pausing
    ? {
        ...presentation,
        accent: "slate",
        actionLabel: null,
        actionType: null,
        body: "Finishing what's already in motion. Pidgeot isn't fetching anything new.",
        eyebrow: "Pausing",
        title: "Settling into a pause.",
        visualMode: "paused",
      }
    : presentation;
  const discoveryFacts = [
    Number.isFinite(scan?.counters?.messagesNormalized)
      ? `${formatQuantity(scan.counters.messagesNormalized, "message")} discovered`
      : null,
    senderGroups.length > 0 ? `${formatQuantity(senderGroups.length, "sender group")} found` : null,
    reviewableGroupCount > 0 ? `${formatQuantity(reviewableGroupCount, "group")} worth a look` : null,
  ].filter(Boolean);
  const selectedCategorySummary = categoryFilters.length === 0
    ? "All categories"
    : `${categoryFilters.length} selected`;

  useEffect(() => {
    if (!pausing) {
      pauseStabilityRef.current = {
        lastUpdatedAt: null,
        stableReads: 0,
      };
      return undefined;
    }

    const timeoutId = window.setTimeout(async () => {
      try {
        const payload = await readJson("/api/scan/status");
        const nextScan = payload.scan;
        setScan(nextScan);
        setErrorMessage(null);

        if (!nextScan || nextScan.state !== SCAN_STATES.PAUSED) {
          pauseStabilityRef.current = {
            lastUpdatedAt: null,
            stableReads: 0,
          };
          return;
        }

        if (pauseStabilityRef.current.lastUpdatedAt === nextScan.updatedAt) {
          const nextStableReads = pauseStabilityRef.current.stableReads + 1;
          pauseStabilityRef.current = {
            lastUpdatedAt: nextScan.updatedAt,
            stableReads: nextStableReads,
          };

          if (nextStableReads >= 1) {
            setPausePhase(null);
          }

          return;
        }

        pauseStabilityRef.current = {
          lastUpdatedAt: nextScan.updatedAt,
          stableReads: 0,
        };
      } catch (error) {
        setErrorMessage(error.message || "The latest scan status could not be loaded.");
        setPausePhase(null);
      }
    }, 650);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [pausing, scan]);

  useEffect(() => {
    if (!autoAdvance || !activeScan || requestState !== "idle") {
      return undefined;
    }

    const scheduledVersion = autoAdvanceVersionRef.current;

    const timeoutId = window.setTimeout(async () => {
      if (autoAdvanceVersionRef.current !== scheduledVersion) {
        return;
      }

      try {
        setRequestState("auto-resume");
        const payload = await readJson("/api/scan/resume", { method: "POST" });
        if (autoAdvanceVersionRef.current !== scheduledVersion) {
          return;
        }
        setScan(payload.scan);
        setErrorMessage(null);
      } catch (error) {
        if (autoAdvanceVersionRef.current !== scheduledVersion) {
          return;
        }
        setErrorMessage(error.message || "The scan could not continue.");
      } finally {
        if (autoAdvanceVersionRef.current === scheduledVersion) {
          setRequestState("idle");
        }
      }
    }, 420);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeScan, autoAdvance, requestState]);

  async function refreshStatus() {
    try {
      const payload = await readJson("/api/scan/status");
      setScan(payload.scan);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error.message || "The latest scan status could not be loaded.");
    }
  }

  function handleSortChange(nextSortMode) {
    setSortMode(nextSortMode);

    if (nextSortMode === "discovery") {
      setActiveSortSnapshot(null);
      return;
    }

    if (activeScan) {
      setActiveSortSnapshot(sortGroupsByUnread(filteredGroups, nextSortMode).map((group) => group.id));
      return;
    }

    setActiveSortSnapshot(null);
  }

  function toggleCategoryFilter(category) {
    setCategoryFilters((current) => (
      current.includes(category)
        ? current.filter((value) => value !== category)
        : [...current, category]
    ));
  }

  function clearFilters() {
    setCategoryFilters([]);
    setSortMode("discovery");
    setActiveSortSnapshot(null);
  }

  async function handleScanAction(actionType) {
    if (actionType === "gmail-upgrade") {
      router.push("/api/auth/google/gmail/start");
      return;
    }

    const pathByAction = {
      pause: "/api/scan/pause",
      resume: "/api/scan/resume",
      start: "/api/scan/start",
    };

    const target = pathByAction[actionType];

    if (!target) {
      return;
    }

    try {
      autoAdvanceVersionRef.current += 1;
      if (actionType === "pause") {
        setPausePhase("settling");
      }

      if (actionType === "resume" || actionType === "start") {
        setPausePhase(null);
      }

      setRequestState(actionType);
      const payload = await readJson(target, { method: "POST" });
      setScan(payload.scan);
      setErrorMessage(null);
    } catch (error) {
      setPausePhase(null);
      setErrorMessage(error.message || "The scan action could not be completed.");
    } finally {
      setRequestState("idle");
    }
  }

  function toggleSelection(groupId) {
    const group = senderGroups.find((entry) => entry.id === groupId);

    if (!isCleanupCandidate(group)) {
      return;
    }

    setSelectedIds((current) => (
      current.includes(groupId)
        ? current.filter((id) => id !== groupId)
        : [...current, groupId]
    ));
  }

  if (!authConfigured) {
    return (
      <section className="rounded-[30px] border border-amber-300/22 bg-[rgba(23,17,7,0.78)] p-6 text-amber-100 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
        <p className="font-mono text-xs uppercase tracking-[0.28em] text-amber-200/80">Configuration required</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white">Add Google OAuth configuration before scanning can begin.</h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-amber-50/85">
          The production scan surface is ready, but the Gmail-authenticated backend session must be configured before Pidgeot can start discovering sender groups.
        </p>
      </section>
    );
  }

  if (!email) {
    return (
      <section className="rounded-[30px] border border-white/12 bg-[rgba(7,11,19,0.84)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
        <p className="font-mono text-xs uppercase tracking-[0.28em] text-slate-400">Start here</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white">Connect your Google account to begin a real scan.</h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
          Pidgeot scans Gmail metadata server-side, progressively groups messages by sender, and keeps partial discoveries visible while the scan continues.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a className="rounded-full bg-[#f4c95d] px-5 py-3 text-sm font-semibold text-slate-950" href="/api/auth/google/start">Continue with Google</a>
          <Link className="rounded-full border border-white/12 bg-white/4 px-5 py-3 text-sm font-semibold text-white" href="/privacy">Privacy posture</Link>
          <Link className="rounded-full border border-white/12 bg-white/4 px-5 py-3 text-sm font-semibold text-white" href="/security">Security notes</Link>
        </div>
      </section>
    );
  }

  return (
    <div className="grid gap-6">
      <section className="rounded-[32px] border border-white/12 bg-[rgba(7,11,19,0.84)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)] md:p-6">
        <div className="grid gap-6 xl:grid-cols-[0.88fr_1.12fr] xl:items-start">
          <div className="space-y-5">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-100/70">{effectivePresentation.eyebrow}</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-[-0.06em] text-white sm:text-5xl">{effectivePresentation.title}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">{effectivePresentation.body}</p>
            </div>

            <RitualStageRail reducedMotion={reducedMotion} scan={scan} settled={pausing} />

            {discoveryFacts.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {discoveryFacts.map((fact) => <DiscoveryFact key={fact}>{fact}</DiscoveryFact>)}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3">
              {effectivePresentation.actionLabel ? (
                <button
                  className={classNames(
                    "rounded-2xl px-5 py-3 text-sm font-semibold shadow-[0_12px_26px_rgba(0,0,0,0.18)] transition-transform duration-200 hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-80",
                    effectivePresentation.accent === "yellow"
                      ? "bg-[#f4c95d] text-slate-950"
                      : effectivePresentation.accent === "emerald"
                        ? "bg-emerald-300 text-slate-950"
                        : "bg-cyan-300 text-slate-950",
                  )}
                  disabled={requestState !== "idle"}
                  onClick={() => handleScanAction(effectivePresentation.actionType)}
                  type="button"
                >
                  {requestState === effectivePresentation.actionType ? "Working…" : effectivePresentation.actionLabel}
                </button>
              ) : null}
              <button
                className="rounded-2xl border border-white/12 bg-white/4 px-5 py-3 text-sm font-semibold text-white transition-colors duration-200 hover:border-white/24 hover:bg-white/8 disabled:opacity-80"
                disabled={requestState !== "idle"}
                onClick={refreshStatus}
                type="button"
              >
                Refresh status
              </button>
              <Link className="rounded-2xl border border-white/12 bg-white/4 px-5 py-3 text-sm font-semibold text-white transition-colors duration-200 hover:border-white/24 hover:bg-white/8" href="/privacy">Privacy posture</Link>
            </div>

            <AnimatePresence initial={false}>
              {errorMessage ? (
                <motion.div
                  key={errorMessage}
                  className="rounded-[22px] border border-rose-300/24 bg-rose-300/10 px-4 py-3 text-sm text-rose-100"
                  initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reducedMotion ? undefined : { opacity: 0, y: -8 }}
                >
                  {errorMessage}
                </motion.div>
              ) : null}
            </AnimatePresence>

            {scan?.state === SCAN_STATES.RESOURCE_LIMIT_REACHED && scan.resourceLimit ? (
              <div className="rounded-[22px] border border-[#f4c95d]/24 bg-[#f4c95d]/10 px-4 py-3 text-sm text-[#fbe9b2]">
                Scan stopped after {scan.resourceLimit.currentMessageCount} retained messages out of the current limit of {scan.resourceLimit.maxRetainedMessages}. Everything already discovered stays available below.
              </div>
            ) : null}

            {scan?.state === SCAN_STATES.PARTIAL_RESULTS_AVAILABLE ? (
              <div className="rounded-[22px] border border-cyan-300/24 bg-cyan-300/10 px-4 py-3 text-sm text-cyan-100">
                Pidgeot is still looking. But it has already found sender groups you can start reviewing now.
              </div>
            ) : null}
          </div>

          <ScanRitualSurface
            mode={effectivePresentation.visualMode}
            reducedMotion={reducedMotion}
            scan={scan}
            senderGroups={senderGroups}
          />
        </div>
      </section>

      <section className="rounded-[32px] border border-white/12 bg-[rgba(7,11,19,0.82)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.25)] md:p-6">
        <div className="flex flex-col gap-4 border-b border-white/10 pb-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.28em] text-slate-400">
              {scan?.state === SCAN_STATES.COMPLETE ? "Ready" : "Discovery results"}
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-white">
              {scan?.state === SCAN_STATES.COMPLETE
                ? "Sender groups are ready for review."
                : "These are the senders Pidgeot is finding."}
            </h2>
            {scan?.state !== SCAN_STATES.COMPLETE ? (
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                Live discoveries stay visible here while Pidgeot keeps scanning. Sensitive financial mail stays out of cleanup.
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <CounterBadge label="Selected" value={visibleSelectedIds.length} />
            <CounterBadge label="Mailbox" value={email} />
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-4 rounded-[24px] border border-white/10 bg-[rgba(8,14,25,0.72)] p-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
            <label className="grid gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">Sort by</span>
              <select
                className="min-w-[220px] rounded-2xl border border-white/12 bg-[rgba(7,11,19,0.92)] px-4 py-3 text-sm text-white outline-none transition-colors duration-200 focus:border-cyan-300/40"
                onChange={(event) => handleSortChange(event.target.value)}
                value={sortMode}
              >
                <option value="discovery">Live discovery order</option>
                <option value="unread-desc">Unread: highest first</option>
                <option value="unread-asc">Unread: lowest first</option>
              </select>
            </label>

            <details className="group relative min-w-[240px]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl border border-white/12 bg-[rgba(7,11,19,0.92)] px-4 py-3 text-sm text-white transition-colors duration-200 hover:border-white/24">
                <span>
                  <span className="mr-2 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">Filter by category</span>
                  <span>{selectedCategorySummary}</span>
                </span>
                <span className="text-slate-500 transition-transform duration-150 group-open:rotate-180">▾</span>
              </summary>
              <div className="absolute left-0 top-[calc(100%+0.75rem)] z-20 w-[280px] rounded-[24px] border border-white/12 bg-[rgba(7,11,19,0.98)] p-3 shadow-[0_18px_40px_rgba(0,0,0,0.32)]">
                <div className="grid gap-2">
                  {CATEGORY_FILTER_OPTIONS.map((category) => {
                    const checked = categoryFilters.includes(category);

                    return (
                      <label key={category} className="flex cursor-pointer items-center justify-between rounded-2xl border border-white/8 bg-white/4 px-3 py-2.5 text-sm text-slate-200 transition-colors duration-150 hover:bg-white/8">
                        <span>{formatLabel(category)}</span>
                        <input
                          checked={checked}
                          className="h-4 w-4 accent-cyan-300"
                          onChange={() => toggleCategoryFilter(category)}
                          type="checkbox"
                        />
                      </label>
                    );
                  })}
                </div>
                <button
                  className="mt-3 w-full rounded-2xl border border-white/12 px-3 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:border-white/24 hover:bg-white/8"
                  onClick={clearFilters}
                  type="button"
                >
                  Clear filters
                </button>
              </div>
            </details>
          </div>

          <p className="text-sm text-slate-400">
            Showing <span className="font-semibold text-white">{visibleGroups.length}</span> of <span className="font-semibold text-white">{senderGroups.length}</span> discovered groups.
          </p>
        </div>

        {scan?.state === SCAN_STATES.COMPLETE && senderGroups.length === 0 ? (
          <div className="mt-5 rounded-[24px] border border-white/10 bg-[rgba(8,14,25,0.76)] px-5 py-12 text-center">
            <p className="text-lg font-semibold text-white">Pidgeot completed the scan but did not find sender groups to review yet.</p>
            <p className="mt-2 text-sm text-slate-400">Try another scan later after new mail arrives.</p>
          </div>
        ) : visibleGroups.length === 0 ? (
          <div className="mt-5 flex items-center justify-between rounded-[24px] border border-white/10 bg-[rgba(8,14,25,0.76)] px-5 py-4">
            <p className="text-sm text-slate-300">No sender groups match these filters.</p>
            <button
              className="rounded-2xl border border-white/12 px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:border-white/24 hover:bg-white/8"
              onClick={clearFilters}
              type="button"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <LayoutGroup>
            <div className="mt-5 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              <AnimatePresence initial={false}>
                {visibleGroups.map((group) => (
                  <motion.div
                    key={group.id}
                    layout
                    initial={reducedMotion ? false : { opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reducedMotion ? undefined : { opacity: 0, y: -10 }}
                    transition={{ duration: reducedMotion ? 0 : 0.22 }}
                  >
                    <SenderGroupCard
                      group={group}
                      onToggle={() => toggleSelection(group.id)}
                      reducedMotion={reducedMotion}
                      selected={visibleSelectedIds.includes(group.id)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </LayoutGroup>
        )}
      </section>
    </div>
  );
}