"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";

import { SENDER_CATEGORIES } from "@/lib/classification/constants";
import { SCAN_STATES } from "@/lib/scanning/constants";
import {
  WORKFLOW_EXECUTION_PROGRESS_PHASES,
  WORKFLOW_EXECUTION_STATES,
} from "@/lib/workflow/constants";

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
  "Discovery only": "Nothing actionable for this sender.",
  "Sensitive mail": "This sender is kept out of cleanup because it appears to be financial or otherwise sensitive.",
};

const AUTOMATIC_UNSUBSCRIBE_STATUSES = new Set(["AUTOMATIC", "ONE_CLICK_READY"]);
const EXECUTION_RUNNING_PHASE_COPY = {
  [WORKFLOW_EXECUTION_PROGRESS_PHASES.PROCESSING]: "Processing",
  [WORKFLOW_EXECUTION_PROGRESS_PHASES.QUEUED]: "Queued",
};

function getWorkflowActionExecution(group, actionType) {
  if (actionType === "unsubscribe") {
    return group?.workflow?.unsubscribeExecution || null;
  }

  if (actionType === "cleanup") {
    return group?.workflow?.cleanupExecution || null;
  }

  return null;
}

function hasExecutionStarted(execution) {
  return execution?.state && execution.state !== WORKFLOW_EXECUTION_STATES.NOT_STARTED;
}

function isExecutionRunning(execution) {
  return execution?.state === WORKFLOW_EXECUTION_STATES.RUNNING;
}

function hasGroupRunningExecution(group) {
  return isExecutionRunning(group?.workflow?.unsubscribeExecution)
    || isExecutionRunning(group?.workflow?.cleanupExecution);
}

function getCleanupExecutionDescription(execution) {
  const summary = execution?.execution?.summary || null;
  const successfulCount = summary?.successfulCount || 0;
  const remainingEligibleCount = summary?.remainingEligibleCount || 0;

  if (execution?.state === WORKFLOW_EXECUTION_STATES.RUNNING) {
    if (execution.phase === WORKFLOW_EXECUTION_PROGRESS_PHASES.QUEUED) {
      return execution.queueSize > 1
        ? `Queued ${execution.queuePosition} of ${execution.queueSize}`
        : "Queued for simulated cleanup";
    }

    return "Removing unread messages from the local discovery view only.";
  }

  if (execution?.state === WORKFLOW_EXECUTION_STATES.COMPLETED) {
    return successfulCount > 0
      ? `Removed ${formatQuantity(successfulCount, "message")} from this local discovery view.`
      : "No unread messages remained for cleanup.";
  }

  if (execution?.state === WORKFLOW_EXECUTION_STATES.PARTIAL_SUCCESS) {
    return `${formatQuantity(successfulCount, "message")} removed · ${formatQuantity(remainingEligibleCount, "message")} left untouched`;
  }

  if (execution?.state === WORKFLOW_EXECUTION_STATES.PAUSED) {
    return "Paused before local cleanup could finish. Resume the scan to continue.";
  }

  if (execution?.state === WORKFLOW_EXECUTION_STATES.FAILED) {
    return "Local cleanup did not complete for this sender.";
  }

  return null;
}

function getUnsubscribeExecutionDescription(group, execution) {
  const summary = execution?.execution?.summary || null;
  const successfulCount = summary?.successfulCount || 0;
  const manualCount = summary?.manualCount || 0;

  if (execution?.state === WORKFLOW_EXECUTION_STATES.RUNNING) {
    if (execution.phase === WORKFLOW_EXECUTION_PROGRESS_PHASES.QUEUED) {
      return execution.queueSize > 1
        ? `Queued ${execution.queuePosition} of ${execution.queueSize}`
        : "Queued for simulated unsubscribe";
    }

    return "Simulating unsubscribe handling without contacting the sender.";
  }

  if (execution?.state === WORKFLOW_EXECUTION_STATES.COMPLETED) {
    return successfulCount > 0
      ? "Handled locally in simulation. Gmail and sender endpoints were not touched."
      : "Nothing needed an automatic unsubscribe path.";
  }

  if (execution?.state === WORKFLOW_EXECUTION_STATES.PARTIAL_SUCCESS) {
    if (successfulCount > 0 && manualCount > 0) {
      return `${formatQuantity(successfulCount, "path")} simulated · ${formatQuantity(manualCount, "path")} still manual`;
    }

    return "Some unsubscribe work completed locally before execution stopped.";
  }

  if (execution?.state === WORKFLOW_EXECUTION_STATES.MANUAL_ACTION_REQUIRED) {
    return "This sender stays manual-only in simulation.";
  }

  if (execution?.state === WORKFLOW_EXECUTION_STATES.PAUSED) {
    return "Paused before unsubscribe simulation could finish. Resume the scan to continue.";
  }

  if (group?.workflow?.unsubscribeHandledLocally) {
    return "Handled locally in simulation. Gmail and sender endpoints were not touched.";
  }

  return null;
}

function getExecutionTone(execution) {
  if (execution?.state === WORKFLOW_EXECUTION_STATES.COMPLETED) {
    return "border-emerald-300/22 bg-emerald-300/10 text-emerald-100";
  }

  if (execution?.state === WORKFLOW_EXECUTION_STATES.PARTIAL_SUCCESS || execution?.state === WORKFLOW_EXECUTION_STATES.MANUAL_ACTION_REQUIRED) {
    return "border-[#f4c95d]/22 bg-[#f4c95d]/10 text-[#fbe9b2]";
  }

  if (execution?.state === WORKFLOW_EXECUTION_STATES.RUNNING) {
    return "border-cyan-300/24 bg-cyan-300/10 text-cyan-100";
  }

  if (execution?.state === WORKFLOW_EXECUTION_STATES.PAUSED) {
    return "border-slate-300/18 bg-white/6 text-slate-200";
  }

  return "border-rose-300/22 bg-rose-300/10 text-rose-100";
}

function getExecutionLabel(actionType, execution) {
  const prefix = actionType === "unsubscribe" ? "Unsubscribe" : "Delete unread";

  if (execution?.state === WORKFLOW_EXECUTION_STATES.RUNNING) {
    return `${prefix} · ${EXECUTION_RUNNING_PHASE_COPY[execution.phase] || "Running"}`;
  }

  if (execution?.state === WORKFLOW_EXECUTION_STATES.COMPLETED) {
    return `${prefix} · Completed`;
  }

  if (execution?.state === WORKFLOW_EXECUTION_STATES.PARTIAL_SUCCESS) {
    return `${prefix} · Partial success`;
  }

  if (execution?.state === WORKFLOW_EXECUTION_STATES.MANUAL_ACTION_REQUIRED) {
    return `${prefix} · Manual required`;
  }

  if (execution?.state === WORKFLOW_EXECUTION_STATES.PAUSED) {
    return `${prefix} · Paused`;
  }

  return `${prefix} · Failed`;
}

function hasCompletedCleanupAction(group) {
  const cleanupExecution = group?.workflow?.cleanupExecution || null;
  const successfulCount = cleanupExecution?.execution?.summary?.successfulCount || 0;

  return successfulCount > 0 && (
    cleanupExecution?.state === WORKFLOW_EXECUTION_STATES.COMPLETED ||
    cleanupExecution?.state === WORKFLOW_EXECUTION_STATES.PARTIAL_SUCCESS
  );
}

function hasCompletedUnsubscribeAction(group) {
  const unsubscribeExecution = group?.workflow?.unsubscribeExecution || null;

  return Boolean(group?.workflow?.unsubscribeHandledLocally) || (
    hasExecutionStarted(unsubscribeExecution) && (
      unsubscribeExecution.state === WORKFLOW_EXECUTION_STATES.COMPLETED ||
      unsubscribeExecution.state === WORKFLOW_EXECUTION_STATES.PARTIAL_SUCCESS
    )
  );
}

function hasSuccessfulUnsubscribeSimulation(group, execution) {
  const summary = execution?.execution?.summary || null;
  const completedSuccessCount = (summary?.successfulCount || 0) + (summary?.alreadyCompletedCount || 0);

  return Boolean(group?.workflow?.unsubscribeHandledLocally) || completedSuccessCount > 0;
}

function hasRemainingCleanupAction(group) {
  return getGroupCleanupEligibleCount(group) > 0;
}

function hasRemainingUnsubscribeAction(group) {
  return getGroupUnsubscribeAvailability(group).available;
}

function hasAutomaticUnsubscribeAction(group) {
  return getGroupUnsubscribeAvailability(group).executable;
}

function isGroupActionable(group) {
  if (!group || isSensitiveFinancialGroup(group)) {
    return false;
  }

  return hasRemainingCleanupAction(group) || hasRemainingUnsubscribeAction(group);
}

function getGroupPrimarySortRank(group) {
  if (hasAutomaticUnsubscribeAction(group)) {
    return 0;
  }

  if (isGroupActionable(group)) {
    return 1;
  }

  return 2;
}

function isGroupDone(group) {
  const hasAnyCompletedAction = hasCompletedCleanupAction(group) || hasCompletedUnsubscribeAction(group);

  if (!hasAnyCompletedAction) {
    return false;
  }

  return !hasRemainingCleanupAction(group) && !hasRemainingUnsubscribeAction(group);
}

function getDoneSummary(group) {
  const fragments = [];
  const cleanupSuccessfulCount = group?.workflow?.cleanupExecution?.execution?.summary?.successfulCount || 0;

  if (hasCompletedUnsubscribeAction(group)) {
    fragments.push("Unsubscribed");
  }

  if (cleanupSuccessfulCount > 0) {
    fragments.push(`${formatCount(cleanupSuccessfulCount)} unread handled`);
  }

  if (fragments.length === 0) {
    return "Handled in simulation";
  }

  return fragments.join(" · ");
}

function buildExecutionSummary({ actionType, groups }) {
  const relevantGroups = groups.filter((group) => {
    const execution = getWorkflowActionExecution(group, actionType);

    if (hasExecutionStarted(execution)) {
      return true;
    }

    if (actionType === "unsubscribe") {
      return hasExecutableUnsubscribeAction(group) || Boolean(group?.workflow?.unsubscribeHandledLocally);
    }

    return getGroupCleanupEligibleCount(group) > 0;
  });
  const executions = relevantGroups
    .map((group) => ({
      execution: getWorkflowActionExecution(group, actionType),
      group,
    }))
    .filter(({ execution }) => Boolean(execution));
  const counts = {
    completed: 0,
    failed: 0,
    manual: 0,
    partial: 0,
    paused: 0,
    processing: 0,
    queued: 0,
    running: 0,
  };

  executions.forEach(({ execution }) => {
    if (execution.state === WORKFLOW_EXECUTION_STATES.RUNNING) {
      counts.running += 1;
      if (execution.phase === WORKFLOW_EXECUTION_PROGRESS_PHASES.QUEUED) {
        counts.queued += 1;
      } else {
        counts.processing += 1;
      }
      return;
    }

    if (execution.state === WORKFLOW_EXECUTION_STATES.COMPLETED) {
      counts.completed += 1;
      return;
    }

    if (execution.state === WORKFLOW_EXECUTION_STATES.PARTIAL_SUCCESS) {
      counts.partial += 1;
      return;
    }

    if (execution.state === WORKFLOW_EXECUTION_STATES.MANUAL_ACTION_REQUIRED) {
      counts.manual += 1;
      return;
    }

    if (execution.state === WORKFLOW_EXECUTION_STATES.PAUSED) {
      counts.paused += 1;
      return;
    }

    if (execution.state === WORKFLOW_EXECUTION_STATES.FAILED) {
      counts.failed += 1;
    }
  });

  let headline = null;

  if (counts.running > 0) {
    const fragments = [];

    if (counts.processing > 0) {
      fragments.push(`${formatQuantity(counts.processing, "sender")} processing`);
    }

    if (counts.queued > 0) {
      fragments.push(`${formatQuantity(counts.queued, "sender")} queued`);
    }

    headline = fragments.join(" · ");
  } else if (counts.partial > 0 || counts.paused > 0 || counts.manual > 0 || counts.failed > 0 || counts.completed > 0) {
    const fragments = [];

    if (counts.completed > 0) {
      fragments.push(`${formatQuantity(counts.completed, "sender")} completed`);
    }

    if (counts.partial > 0) {
      fragments.push(`${formatQuantity(counts.partial, "sender")} partial`);
    }

    if (counts.manual > 0) {
      fragments.push(`${formatQuantity(counts.manual, "sender")} manual`);
    }

    if (counts.paused > 0) {
      fragments.push(`${formatQuantity(counts.paused, "sender")} paused`);
    }

    if (counts.failed > 0) {
      fragments.push(`${formatQuantity(counts.failed, "sender")} failed`);
    }

    headline = fragments.join(" · ");
  }

  return {
    counts,
    hasResults: executions.length > 0,
    hasRunning: counts.running > 0,
    headline,
    relevantCount: relevantGroups.length,
  };
}

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

  if (isGroupActionable(group)) {
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

function getUnsubscribeSeverVisualState({ armed, execution, group }) {
  if (execution?.state === WORKFLOW_EXECUTION_STATES.RUNNING) {
    return execution.phase === WORKFLOW_EXECUTION_PROGRESS_PHASES.QUEUED ? "queued" : "processing";
  }

  if (execution?.state === WORKFLOW_EXECUTION_STATES.COMPLETED) {
    return hasSuccessfulUnsubscribeSimulation(group, execution) ? "completed" : "manual";
  }

  if (execution?.state === WORKFLOW_EXECUTION_STATES.PARTIAL_SUCCESS) {
    return hasSuccessfulUnsubscribeSimulation(group, execution) ? "partial" : "failed";
  }

  if (execution?.state === WORKFLOW_EXECUTION_STATES.MANUAL_ACTION_REQUIRED) {
    return "manual";
  }

  if (execution?.state === WORKFLOW_EXECUTION_STATES.PAUSED) {
    return "paused";
  }

  if (
    execution?.state === WORKFLOW_EXECUTION_STATES.FAILED
    || execution?.state === WORKFLOW_EXECUTION_STATES.REAUTH_REQUIRED
  ) {
    return "failed";
  }

  return armed ? "armed" : null;
}

function getUnsubscribeSeverCopy(visualState) {
  if (visualState === "queued") {
    return {
      badge: "Queued",
      body: "The simulated unsubscribe request is lined up locally and waiting to begin.",
      headline: "Unsubscribe queued",
      tone: "border-cyan-300/16 bg-cyan-300/8",
      toneAccent: "text-cyan-100",
      toneLine: "text-[#f4c95d]",
    };
  }

  if (visualState === "processing") {
    return {
      badge: "Severing",
      body: "Submitting a local-only unsubscribe request and breaking the sender's active path.",
      headline: "Severing unsubscribe path",
      tone: "border-cyan-300/20 bg-cyan-300/10",
      toneAccent: "text-cyan-100",
      toneLine: "text-[#f4c95d]",
    };
  }

  if (visualState === "completed") {
    return {
      badge: "Submitted",
      body: "Simulated locally only. Gmail and sender endpoints were not touched.",
      headline: "Unsubscribe request submitted",
      tone: "border-emerald-300/18 bg-emerald-300/10",
      toneAccent: "text-emerald-100",
      toneLine: "text-emerald-200",
    };
  }

  if (visualState === "partial") {
    return {
      badge: "Submitted",
      body: "Automatic-capable paths were simulated. Any remaining unsubscribe work is still manual.",
      headline: "Unsubscribe request submitted",
      tone: "border-[#f4c95d]/20 bg-[#f4c95d]/10",
      toneAccent: "text-[#fbe9b2]",
      toneLine: "text-[#f4c95d]",
    };
  }

  if (visualState === "failed") {
    return {
      badge: "Failed",
      body: "The simulated unsubscribe request did not complete. Nothing was sent to sender endpoints.",
      headline: "Unsubscribe request failed",
      tone: "border-rose-300/20 bg-rose-300/10",
      toneAccent: "text-rose-100",
      toneLine: "text-rose-200",
    };
  }

  if (visualState === "paused") {
    return {
      badge: "Paused",
      body: "Resume the scan to continue this local-only unsubscribe simulation.",
      headline: "Unsubscribe paused",
      tone: "border-white/10 bg-white/5",
      toneAccent: "text-slate-100",
      toneLine: "text-slate-300",
    };
  }

  if (visualState === "manual") {
    return {
      badge: "Manual",
      body: "This sender still needs a manual unsubscribe step. No automatic sever path was available.",
      headline: "Manual unsubscribe still required",
      tone: "border-white/10 bg-white/5",
      toneAccent: "text-slate-100",
      toneLine: "text-slate-300",
    };
  }

  return {
    badge: "Linked",
    body: "This sender is linked to the unsubscribe action. Execute to simulate the break locally.",
    headline: "Ready to sever unsubscribe path",
    tone: "border-white/10 bg-white/5",
    toneAccent: "text-slate-100",
    toneLine: "text-[#f4c95d]",
  };
}

function shouldShowUnsubscribeSeverSurface({ armedActionType, execution, group }) {
  if (armedActionType !== "unsubscribe" && !hasExecutionStarted(execution)) {
    return false;
  }

  const unsubscribeAvailability = getGroupUnsubscribeAvailability(group);

  return unsubscribeAvailability.automaticCount > 0
    || hasSuccessfulUnsubscribeSimulation(group, execution)
    || isExecutionRunning(execution)
    || execution?.state === WORKFLOW_EXECUTION_STATES.FAILED
    || execution?.state === WORKFLOW_EXECUTION_STATES.PAUSED;
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

function UnsubscribeSeverSurface({ armed, execution, group, reducedMotion }) {
  const visualState = getUnsubscribeSeverVisualState({ armed, execution, group });

  if (!visualState) {
    return null;
  }

  const copy = getUnsubscribeSeverCopy(visualState);
  const broken = visualState === "processing" || visualState === "completed" || visualState === "partial";
  const restoring = visualState === "failed" || visualState === "paused" || visualState === "manual";
  const title = getGroupTitle(group);

  return (
    <motion.div
      className={classNames("mt-4 rounded-[20px] border px-3 py-3", copy.tone)}
      initial={reducedMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reducedMotion ? 0 : 0.22 }}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-400">Unsubscribe path</p>
        <span className={classNames("rounded-full border border-current/18 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em]", copy.toneAccent)}>
          {copy.badge}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <motion.div
          className="min-w-0 rounded-full border border-white/12 bg-[rgba(7,11,19,0.72)] px-3 py-2"
          animate={reducedMotion || visualState !== "processing"
            ? { scale: 1, y: 0 }
            : { scale: [1, 1.02, 1], y: [0, -1, 0] }}
          transition={reducedMotion ? { duration: 0 } : { duration: 0.86, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="truncate text-sm font-medium text-white">{title}</p>
          <p className="truncate text-[11px] text-slate-400">sender</p>
        </motion.div>

        <div className={classNames("relative h-10 flex-1 min-w-[88px]", copy.toneLine)}>
          <motion.span
            className="absolute left-0 top-1/2 h-px w-[calc(50%-0.65rem)] -translate-y-1/2 rounded-full bg-current"
            style={{ originX: 1 }}
            animate={reducedMotion
              ? { opacity: broken ? 0.55 : 1, scaleX: broken ? 0.36 : 1 }
              : broken
                ? { opacity: [1, 0.9, 0.55], scaleX: [1, 0.72, 0.36] }
                : restoring
                  ? { opacity: 1, scaleX: 1 }
                  : visualState === "queued"
                    ? { opacity: [0.68, 1, 0.68], scaleX: 1 }
                    : { opacity: 1, scaleX: 1 }}
            transition={reducedMotion
              ? { duration: 0 }
              : broken
                ? { duration: 0.88, ease: [0.22, 1, 0.36, 1] }
                : visualState === "queued"
                  ? { duration: 0.52, ease: "easeInOut", repeat: Infinity }
                  : { duration: 0.22 }}
          />
          <motion.span
            className="absolute right-0 top-1/2 h-px w-[calc(50%-0.65rem)] -translate-y-1/2 rounded-full bg-current"
            style={{ originX: 0 }}
            animate={reducedMotion
              ? { opacity: broken ? 0.55 : 1, scaleX: broken ? 0.36 : 1 }
              : broken
                ? { opacity: [1, 0.9, 0.55], scaleX: [1, 0.68, 0.32] }
                : restoring
                  ? { opacity: 1, scaleX: 1 }
                  : visualState === "queued"
                    ? { opacity: [0.68, 1, 0.68], scaleX: 1 }
                    : { opacity: 1, scaleX: 1 }}
            transition={reducedMotion
              ? { duration: 0 }
              : broken
                ? { duration: 0.88, ease: [0.22, 1, 0.36, 1] }
                : visualState === "queued"
                  ? { duration: 0.52, ease: "easeInOut", repeat: Infinity }
                  : { duration: 0.22 }}
          />
          <motion.span
            className="absolute left-1/2 top-1/2 h-5 w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-current"
            animate={reducedMotion
              ? { opacity: broken ? 1 : 0.18, rotate: broken ? 38 : 0, scaleY: broken ? 1 : 0.65 }
              : broken
                ? { opacity: [0.22, 1, 1], rotate: [0, 22, 38], scaleY: [0.65, 1.12, 1] }
                : restoring
                  ? { opacity: 0.32, rotate: 0, scaleY: 0.72 }
                  : visualState === "queued"
                    ? { opacity: [0.16, 0.5, 0.16], rotate: [0, 8, 0], scaleY: [0.65, 0.8, 0.65] }
                    : { opacity: 0.18, rotate: 0, scaleY: 0.65 }}
            transition={reducedMotion
              ? { duration: 0 }
              : broken
                ? { duration: 0.96, ease: [0.16, 1, 0.3, 1] }
                : visualState === "queued"
                  ? { duration: 0.58, ease: "easeInOut", repeat: Infinity }
                  : { duration: 0.22 }}
          />
        </div>

        <motion.div
          className={classNames(
            "rounded-full border px-3 py-2 text-right",
            visualState === "failed"
              ? "border-rose-300/24 bg-rose-300/12"
              : visualState === "completed"
                ? "border-emerald-300/24 bg-emerald-300/12"
                : "border-white/12 bg-[rgba(7,11,19,0.72)]",
          )}
          animate={reducedMotion
            ? { scale: 1, x: broken ? 4 : 0 }
            : visualState === "processing"
              ? { scale: [1, 1.02, 1], x: [0, 2, 6] }
              : broken
                ? { scale: 1, x: 6 }
                : { scale: 1, x: 0 }}
          transition={reducedMotion ? { duration: 0 } : { duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="text-sm font-medium text-white">Unsubscribe</p>
          <p className="text-[11px] text-slate-400">request</p>
        </motion.div>
      </div>

      <div className="mt-3">
        <p className={classNames("font-medium", copy.toneAccent)}>{copy.headline}</p>
        <p className="mt-1 text-xs leading-5 text-slate-300">{copy.body}</p>
      </div>
    </motion.div>
  );
}

function getReviewableGroupCount(senderGroups) {
  return senderGroups.filter((group) => isGroupActionable(group)).length;
}

function getGroupCleanupEligibleCount(group) {
  if (Number.isFinite(group?.workflow?.cleanupEligibleCount)) {
    return group.workflow.cleanupEligibleCount;
  }

  if (isSensitiveFinancialGroup(group)) {
    return 0;
  }

  return Number.isFinite(group?.unreadCount) ? group.unreadCount : 0;
}

function getGroupUnsubscribeAvailability(group) {
  const mechanisms = Array.isArray(group?.unsubscribe?.mechanisms) ? group.unsubscribe.mechanisms : [];
  const actionableMechanisms = mechanisms.filter((mechanism) => (
    AUTOMATIC_UNSUBSCRIBE_STATUSES.has(mechanism?.status) || mechanism?.manualActionRequired || mechanism?.status === "MANUAL_ACTION_REQUIRED"
  ));
  const fallbackAutomaticCount = actionableMechanisms.filter((mechanism) => (
    AUTOMATIC_UNSUBSCRIBE_STATUSES.has(mechanism?.status) || mechanism?.automatic
  )).length;
  const fallbackManualCount = actionableMechanisms.filter((mechanism) => (
    !AUTOMATIC_UNSUBSCRIBE_STATUSES.has(mechanism?.status) && (mechanism?.manualActionRequired || mechanism?.status === "MANUAL_ACTION_REQUIRED")
  )).length;
  const manualOperations = Array.isArray(group?.workflow?.manualUnsubscribeOperations)
    ? group.workflow.manualUnsubscribeOperations
    : [];
  const automaticCount = Number.isFinite(group?.workflow?.unsubscribeAutomaticOperationCount)
    ? group.workflow.unsubscribeAutomaticOperationCount
    : fallbackAutomaticCount;
  const manualCount = manualOperations.length > 0 ? manualOperations.length : fallbackManualCount;
  const available = automaticCount > 0 || manualCount > 0;

  return {
    available,
    automaticCount,
    executable: automaticCount > 0,
    manualCount,
  };
}

function hasExecutableUnsubscribeAction(group) {
  return getGroupUnsubscribeAvailability(group).executable;
}

function getManualUnsubscribeOperations(group) {
  return Array.isArray(group?.workflow?.manualUnsubscribeOperations)
    ? group.workflow.manualUnsubscribeOperations
    : [];
}

function hasManualOnlyUnsubscribeAction(group) {
  const unsubscribeAvailability = getGroupUnsubscribeAvailability(group);

  return unsubscribeAvailability.automaticCount === 0 && unsubscribeAvailability.manualCount > 0;
}

function buildSelectionSnapshot(groups) {
  const selectedCount = groups.length;
  let cleanupEligibleGroupCount = 0;
  let cleanupEligibleUnreadCount = 0;
  let unsubscribeAutomaticGroupCount = 0;
  let unsubscribeManualGroupCount = 0;

  for (const group of groups) {
    const cleanupEligibleCount = getGroupCleanupEligibleCount(group);
    const unsubscribeAvailability = getGroupUnsubscribeAvailability(group);

    if (cleanupEligibleCount > 0) {
      cleanupEligibleGroupCount += 1;
      cleanupEligibleUnreadCount += cleanupEligibleCount;
    }

    if (unsubscribeAvailability.automaticCount > 0) {
      unsubscribeAutomaticGroupCount += 1;
    }

    if (unsubscribeAvailability.automaticCount === 0 && unsubscribeAvailability.manualCount > 0) {
      unsubscribeManualGroupCount += 1;
    }
  }

  return {
    cleanupEligibleGroupCount,
    cleanupEligibleUnreadCount,
    selectedCount,
    unsubscribeAutomaticGroupCount,
    unsubscribeManualGroupCount,
  };
}

function sortGroupsForDisplay(groups, sortMode) {
  return [...groups]
    .map((group, index) => ({ group, index }))
    .sort((left, right) => {
      const primaryDifference = getGroupPrimarySortRank(left.group) - getGroupPrimarySortRank(right.group);

      if (primaryDifference !== 0) {
        return primaryDifference;
      }

      if (sortMode === "unread-asc" || sortMode === "unread-desc") {
        const direction = sortMode === "unread-asc" ? 1 : -1;
        const unreadDifference = ((left.group.unreadCount || 0) - (right.group.unreadCount || 0)) * direction;

        if (unreadDifference !== 0) {
          return unreadDifference;
        }
      }

      return left.index - right.index;
    })
    .map((entry) => entry.group);
}

function getSortDescription(sortMode) {
  if (sortMode === "unread-desc") {
    return "Sorted by unsubscribe availability, then unread count high to low.";
  }

  if (sortMode === "unread-asc") {
    return "Sorted by unsubscribe availability, then unread count low to high.";
  }

  return "Sorted by unsubscribe availability, then live discovery order.";
}

function getSelectionActionSummary(snapshot) {
  if (!snapshot) {
    return null;
  }

  const unsubscribeEnabled = snapshot.unsubscribeAutomaticGroupCount > 0;
  const cleanupEnabled = snapshot.cleanupEligibleGroupCount > 0 && snapshot.cleanupEligibleUnreadCount > 0;

  let unsubscribeDetail = "Unavailable for this selection.";

  if (snapshot.unsubscribeAutomaticGroupCount > 0 || snapshot.unsubscribeManualGroupCount > 0) {
    const unsubscribeParts = [];

    if (snapshot.unsubscribeAutomaticGroupCount > 0) {
      unsubscribeParts.push(`${formatQuantity(snapshot.unsubscribeAutomaticGroupCount, "sender")} automatic`);
    }

    if (snapshot.unsubscribeManualGroupCount > 0) {
      unsubscribeParts.push(`${formatQuantity(snapshot.unsubscribeManualGroupCount, "sender")} manual`);
    }

    unsubscribeDetail = unsubscribeParts.join(" · ");
  }

  return {
    cleanup: {
      description: cleanupEnabled
        ? `${formatQuantity(snapshot.cleanupEligibleGroupCount, "sender")} · ${formatQuantity(snapshot.cleanupEligibleUnreadCount, "unread message")}`
        : "No unread cleanup available.",
      enabled: cleanupEnabled,
      label: "Delete unread",
    },
    unsubscribe: {
      description: unsubscribeDetail,
      enabled: unsubscribeEnabled,
      label: "Unsubscribe",
      manualGroupCount: snapshot.unsubscribeManualGroupCount,
      automaticGroupCount: snapshot.unsubscribeAutomaticGroupCount,
    },
  };
}

function formatManualUnsubscribeMethod(operation) {
  if (operation?.type === "MAILTO") {
    return "Preaddressed unsubscribe email";
  }

  if (operation?.type === "HTTPS_LINK") {
    return "Manual unsubscribe page";
  }

  if (operation?.type === "HTTP_LINK") {
    return "Manual unsubscribe link";
  }

  return formatLabel(operation?.type || "MANUAL_ACTION_REQUIRED");
}

function getManualUnsubscribeReason(operation) {
  if (operation?.type === "MAILTO") {
    return "Pidgeot found a mailto unsubscribe address, which still needs a manual email step.";
  }

  if (operation?.type === "HTTPS_LINK") {
    return "Pidgeot found an unsubscribe page, but it is not a one-click request that Pidgeot can submit automatically.";
  }

  if (operation?.type === "HTTP_LINK") {
    return "Pidgeot found a web unsubscribe link that is not an automatic one-click HTTPS request, so it stays manual.";
  }

  return "Pidgeot found an unsubscribe option, but it still requires a manual action.";
}

function stopNestedCardEvent(event) {
  event.preventDefault();
  event.stopPropagation();
}

function ManualUnsubscribeChip({ onClick }) {
  return (
    <button
      aria-haspopup="dialog"
      className="rounded-full border border-cyan-300/28 bg-cyan-300/14 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-100 underline-offset-2 transition-colors duration-200 hover:border-cyan-300/48 hover:bg-cyan-300/22 hover:underline"
      onClick={(event) => {
        stopNestedCardEvent(event);
        onClick();
      }}
      onKeyDown={stopNestedCardEvent}
      type="button"
    >
      Manual unsubscribe
    </button>
  );
}

function ManualCountButton({ count, disabled, onClick }) {
  return (
    <button
      className={classNames(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium transition-colors duration-200",
        disabled
          ? "cursor-not-allowed border-white/8 bg-black/18 text-slate-500"
          : "border-cyan-300/20 bg-cyan-300/10 text-cyan-100 hover:border-cyan-300/36 hover:bg-cyan-300/14",
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {`${formatQuantity(count, "sender")} manual`}
    </button>
  );
}

function SelectionSummaryRow({ action, manualDisabled = false, onOpenManualDetails }) {
  if (!action) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
      <span className="font-semibold text-white">{action.label}</span>
      {action.label === "Unsubscribe" ? (
        <>
          {action.automaticGroupCount > 0 ? <span>{`${formatQuantity(action.automaticGroupCount, "sender")} automatic`}</span> : null}
          {action.manualGroupCount > 0 ? (
            <ManualCountButton
              count={action.manualGroupCount}
              disabled={manualDisabled}
              onClick={onOpenManualDetails}
            />
          ) : null}
          {!action.enabled && action.manualGroupCount === 0 ? <span>Unavailable for this selection.</span> : null}
        </>
      ) : (
        <span>{action.enabled ? action.description : "No unread cleanup available."}</span>
      )}
    </div>
  );
}

function ManualUnsubscribeDetailsModal({ groups, onClose, reducedMotion }) {
  const closeButtonRef = useRef(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <AnimatePresence>
      <motion.div
        key="manual-unsubscribe-backdrop"
        aria-hidden="true"
        className="fixed inset-0 z-40 bg-[rgba(2,6,12,0.72)] backdrop-blur-[2px]"
        initial={reducedMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={reducedMotion ? undefined : { opacity: 0 }}
        onClick={onClose}
      />
      <motion.section
        key="manual-unsubscribe-dialog"
        aria-labelledby="manual-unsubscribe-title"
        aria-modal="true"
        className="fixed left-1/2 top-1/2 z-50 w-[min(720px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-[28px] border border-white/12 bg-[rgba(7,11,19,0.98)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.38)]"
        initial={reducedMotion ? false : { opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reducedMotion ? undefined : { opacity: 0, y: 12, scale: 0.98 }}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        transition={{ duration: reducedMotion ? 0 : 0.2 }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">Manual unsubscribe</p>
            <h3 id="manual-unsubscribe-title" className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-white">Manual unsubscribe details</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Automatic unsubscribe is unavailable. These senders still have a manual path.</p>
          </div>
          <button
            className="rounded-2xl border border-white/12 px-3 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:border-white/24 hover:bg-white/8"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            Close
          </button>
        </div>

        <div className="mt-5 max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          {groups.map((group) => {
            const manualOperations = getManualUnsubscribeOperations(group);

            return (
              <div key={`manual-${group.id}`} className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                <p className="text-lg font-semibold text-white">{getGroupTitle(group)}</p>
                <p className="mt-1 text-sm text-slate-400">{group.representativeAddress || "Representative address unavailable"}</p>
                <p className="mt-3 text-sm leading-6 text-slate-300">Automatic unsubscribe is unavailable for this sender.</p>

                <div className="mt-4 grid gap-3">
                  {manualOperations.length > 0 ? manualOperations.map((operation) => (
                    <div key={operation.id} className="rounded-[20px] border border-white/10 bg-[rgba(7,11,19,0.76)] p-3">
                      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">Unsubscribe method</p>
                      <p className="mt-1 font-medium text-white">{formatManualUnsubscribeMethod(operation)}</p>

                      {operation.mailto?.recipient ? (
                        <p className="mt-2 text-sm text-slate-300">{operation.mailto.recipient}</p>
                      ) : null}
                      {operation.host ? (
                        <p className="mt-2 text-sm text-slate-300">{`${operation.host}${operation.path || ""}`}</p>
                      ) : null}
                      {operation.mailto?.subject ? (
                        <p className="mt-2 text-xs text-slate-400">Subject: {operation.mailto.subject}</p>
                      ) : null}

                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        {operation.type === "HTTPS_LINK" && operation.target ? (
                          <a
                            className="rounded-2xl border border-cyan-300/24 bg-cyan-300/10 px-3 py-2 text-sm font-semibold text-cyan-100 transition-colors duration-200 hover:border-cyan-300/36 hover:bg-cyan-300/16"
                            href={operation.target}
                            rel="noreferrer"
                            target="_blank"
                          >
                            Open unsubscribe page
                          </a>
                        ) : null}
                        <span className="text-xs leading-5 text-slate-400">{getManualUnsubscribeReason(operation)}</span>
                      </div>
                    </div>
                  )) : (
                    <p className="text-sm text-slate-400">Pidgeot is still loading the manual unsubscribe details for this sender.</p>
                  )}
                </div>

                <p className="mt-4 text-xs leading-5 text-slate-500">Pidgeot won&apos;t submit this request automatically.</p>
              </div>
            );
          })}
        </div>
      </motion.section>
    </AnimatePresence>
  );
}

function BulkSelectionControls({ allVisibleSelected, disabled, onClearAll, onSelectAll, selectedCount, visibleSelectableCount }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        className={classNames(
          "rounded-2xl border px-4 py-2 text-sm font-semibold transition-colors duration-200",
          disabled || visibleSelectableCount === 0 || allVisibleSelected
            ? "cursor-not-allowed border-white/8 bg-black/18 text-slate-500"
            : "border-white/12 bg-[rgba(7,11,19,0.92)] text-white hover:border-white/24 hover:bg-white/8",
        )}
        disabled={disabled || visibleSelectableCount === 0 || allVisibleSelected}
        onClick={onSelectAll}
        type="button"
      >
        Select all
      </button>
      <button
        className={classNames(
          "rounded-2xl border px-4 py-2 text-sm font-semibold transition-colors duration-200",
          disabled || selectedCount === 0
            ? "cursor-not-allowed border-white/8 bg-black/18 text-slate-500"
            : "border-white/12 bg-[rgba(7,11,19,0.92)] text-white hover:border-white/24 hover:bg-white/8",
        )}
        disabled={disabled || selectedCount === 0}
        onClick={onClearAll}
        type="button"
      >
        Clear all
      </button>
      {selectedCount > 0 ? (
        <p className="text-sm text-slate-400">
          <span className="font-semibold text-white">{formatQuantity(selectedCount, "sender group")}</span> selected
        </p>
      ) : null}
    </div>
  );
}

function ManualUnsubscribeInfoCard({ disabled, onOpenManualDetails }) {
  return (
    <div className="flex min-h-[72px] min-w-[220px] flex-1 flex-col items-start justify-center rounded-[22px] border border-white/12 bg-[rgba(7,11,19,0.88)] px-4 py-3 text-left">
      <span className="text-sm font-semibold text-white">Unsubscribe</span>
      <span className="mt-1 text-xs leading-5 text-slate-400">Manual action required</span>
      <button
        className={classNames(
          "mt-2 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors duration-200",
          disabled
            ? "cursor-not-allowed border-white/8 bg-black/18 text-slate-500"
            : "border-cyan-300/24 bg-cyan-300/10 text-cyan-100 hover:border-cyan-300/36 hover:bg-cyan-300/16",
        )}
        disabled={disabled}
        onClick={onOpenManualDetails}
        type="button"
      >
        View instructions
      </button>
    </div>
  );
}

function SelectionActionButton({ active, description, disabled, label, onClick }) {
  return (
    <motion.button
      aria-pressed={active}
      className={classNames(
        "flex min-h-[72px] min-w-[220px] flex-1 flex-col items-start justify-center rounded-[22px] border px-4 py-3 text-left transition-[background-color,border-color,transform] duration-200",
        disabled
          ? "cursor-not-allowed border-white/8 bg-black/20 text-slate-500"
          : active
            ? "border-cyan-300/28 bg-cyan-300/12 text-white shadow-[0_10px_22px_rgba(8,14,25,0.2)]"
            : "border-white/12 bg-[rgba(7,11,19,0.88)] text-white hover:border-white/24 hover:bg-white/8",
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
      whileTap={disabled ? undefined : { scale: 0.985 }}
    >
      <span className="text-sm font-semibold">{label}</span>
      <span className={classNames("mt-1 text-xs leading-5", disabled ? "text-slate-500" : active ? "text-cyan-100" : "text-slate-400")}>
        {description}
      </span>
    </motion.button>
  );
}

function SelectionActionBar({
  actionSummary,
  activeDecision,
  executionRequestState,
  executionSummary,
  hasRunningExecution,
  onDecisionChange,
  onExecute,
  onOpenManualDetails,
  reducedMotion,
  selectedCount,
  workflowExecutionMode,
}) {
  const selectionLabel = formatQuantity(selectedCount, "sender");
  const unsubscribeButtonDescription = actionSummary.unsubscribe.enabled
    ? actionSummary.unsubscribe.description
    : "Unavailable for this selection.";
  const cleanupButtonDescription = actionSummary.cleanup.enabled
    ? actionSummary.cleanup.description
    : "No unread cleanup available.";
  const manualOnlyUnsubscribe = !actionSummary.unsubscribe.enabled && actionSummary.unsubscribe.manualGroupCount > 0;
  const executionButtonLabel = workflowExecutionMode === "SIMULATED"
    ? activeDecision === "unsubscribe"
      ? "Run simulated unsubscribe"
      : "Run simulated delete unread"
    : activeDecision === "unsubscribe"
      ? "Unsubscribe selected"
      : "Delete unread";
  const actionLocked = executionRequestState !== "idle" || hasRunningExecution;
  const executeDisabled = !activeDecision || actionLocked;

  return (
    <motion.section
      key="selection-action-bar"
      className="mt-5 rounded-[28px] border border-cyan-300/16 bg-[linear-gradient(135deg,rgba(56,189,248,0.12),rgba(7,11,19,0.94)_28%,rgba(7,11,19,0.94))] p-4 shadow-[0_18px_48px_rgba(0,0,0,0.24)]"
      initial={reducedMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reducedMotion ? undefined : { opacity: 0, y: 8 }}
      transition={{ duration: reducedMotion ? 0 : 0.22 }}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-cyan-100/70">Selection</p>
          <h3 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-white">{selectionLabel} selected</h3>
          <p className="mt-2 text-sm leading-6 text-slate-300">What would you like Pidgeot to do with these senders?</p>
        </div>
        <div className="grid gap-2">
          {actionSummary.unsubscribe.enabled ? (
            <SelectionSummaryRow
              action={actionSummary.unsubscribe}
              onOpenManualDetails={onOpenManualDetails}
            />
          ) : null}
          <SelectionSummaryRow action={actionSummary.cleanup} />
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 lg:flex-row">
        {manualOnlyUnsubscribe ? (
          <ManualUnsubscribeInfoCard
            disabled={actionLocked}
            onOpenManualDetails={onOpenManualDetails}
          />
        ) : (
          <SelectionActionButton
            active={activeDecision === "unsubscribe"}
            description={unsubscribeButtonDescription}
            disabled={!actionSummary.unsubscribe.enabled || actionLocked}
            label={actionSummary.unsubscribe.label}
            onClick={() => onDecisionChange(activeDecision === "unsubscribe" ? null : "unsubscribe")}
          />
        )}
        <SelectionActionButton
          active={activeDecision === "cleanup"}
          description={cleanupButtonDescription}
          disabled={!actionSummary.cleanup.enabled || actionLocked}
          label={actionSummary.cleanup.label}
          onClick={() => onDecisionChange(activeDecision === "cleanup" ? null : "cleanup")}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {workflowExecutionMode === "SIMULATED" ? (
          <span className="inline-flex items-center rounded-full border border-cyan-300/24 bg-cyan-300/10 px-3 py-2 text-xs font-medium text-cyan-100">
            SIMULATION MODE — Gmail won&apos;t be changed.
          </span>
        ) : null}
        {executionSummary?.headline ? (
          <span className="inline-flex items-center rounded-full border border-white/10 bg-white/6 px-3 py-2 text-xs font-medium text-slate-200">
            {executionSummary.headline}
          </span>
        ) : null}
        {activeDecision ? (
          <>
            <motion.button
              className={classNames(
                "rounded-2xl border px-4 py-2.5 text-sm font-semibold transition-[background-color,border-color,transform] duration-200",
                executeDisabled
                  ? "cursor-not-allowed border border-white/10 bg-white/6 text-slate-500"
                  : "border-[#f4c95d]/40 bg-[#f4c95d] text-slate-950 shadow-[0_12px_26px_rgba(0,0,0,0.22)] hover:border-[#f7d77d] hover:bg-[#f7d77d]",
              )}
              disabled={executeDisabled}
              onClick={onExecute}
              type="button"
              whileTap={executeDisabled ? undefined : { scale: 0.985 }}
            >
              {executionRequestState === "submitting"
                ? "Queueing..."
                : hasRunningExecution
                  ? "Execution in progress"
                  : executionButtonLabel}
            </motion.button>
            {hasRunningExecution ? (
              <span className="inline-flex items-center rounded-full border border-cyan-300/24 bg-cyan-300/10 px-3 py-2 text-xs font-medium text-cyan-100">
                Queued and processing follow the live workflow state.
              </span>
            ) : null}
          </>
        ) : null}
      </div>
    </motion.section>
  );
}

function hasPendingPauseWork(scan) {
  if (!scan?.sourceSummaries) {
    return false;
  }

  return Object.values(scan.sourceSummaries).some((summary) => (
    (summary?.inFlightMessageCount || 0) > 0
  ));
}

function getActionButtonLabel({ actionLabel, pausing, requestState }) {
  if (pausing) {
    return "Pausing...";
  }

  if (requestState === "resume") {
    return "Resuming...";
  }

  if (requestState === "start") {
    return "Starting scan...";
  }

  return actionLabel;
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

function SenderGroupCard({ armedActionType = null, group, mode = "active", onOpenManualDetails, reducedMotion, selected, onToggle }) {
  const title = getGroupTitle(group);
  const domainChips = group.senderDomains.slice(0, 3);
  const sensitiveFinancial = isSensitiveFinancialGroup(group);
  const actionable = isGroupActionable(group);
  const done = mode === "done";
  const statusLabel = done ? "Handled" : getActionabilityLabel(group, false);
  const statusTooltip = done ? "Completed in this simulated workflow session only." : getActionabilityTooltip(statusLabel, group.unsubscribe);
  const unsubscribeExecution = group?.workflow?.unsubscribeExecution || null;
  const cleanupExecution = group?.workflow?.cleanupExecution || null;
  const showUnsubscribeSeverSurface = !done && shouldShowUnsubscribeSeverSurface({
    armedActionType,
    execution: unsubscribeExecution,
    group,
  });
  const doneSummary = done ? getDoneSummary(group) : null;
  const executionCards = [
    !showUnsubscribeSeverSurface && unsubscribeExecution && hasExecutionStarted(unsubscribeExecution)
      ? {
          actionType: "unsubscribe",
          description: getUnsubscribeExecutionDescription(group, unsubscribeExecution),
          execution: unsubscribeExecution,
        }
      : null,
    cleanupExecution && hasExecutionStarted(cleanupExecution)
      ? {
          actionType: "cleanup",
          description: getCleanupExecutionDescription(cleanupExecution),
          execution: cleanupExecution,
        }
      : null,
  ].filter(Boolean);
  const showManualUnsubscribeChip = !done && hasManualOnlyUnsubscribeAction(group) && typeof onOpenManualDetails === "function";
  const interactive = !done && actionable;

  return (
    <motion.div
      layout
      aria-disabled={!interactive}
      aria-pressed={interactive ? selected : undefined}
      className={classNames(
        "h-full min-h-[272px] w-full rounded-[26px] border bg-[rgba(8,14,25,0.86)] p-4 text-left shadow-[0_16px_34px_rgba(0,0,0,0.16)] transition-colors",
        done
          ? "border-white/8 bg-[rgba(8,14,25,0.68)]"
          : selected
          ? "border-cyan-300/32 bg-[rgba(11,21,33,0.94)]"
          : actionable
            ? "border-white/10"
            : sensitiveFinancial
              ? "border-amber-300/16 bg-[rgba(18,15,10,0.78)]"
              : "border-white/6 bg-[rgba(8,14,25,0.68)]",
        interactive ? "cursor-pointer" : "cursor-default",
      )}
      onClick={interactive ? onToggle : undefined}
      onKeyDown={interactive ? (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onToggle();
        }
      } : undefined}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : -1}
      whileTap={reducedMotion ? undefined : { scale: 0.99 }}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">sender group</p>
            {!done && selected ? (
              <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-cyan-100">Selected</p>
            ) : null}
            <div className="mt-2 min-h-[56px] overflow-hidden">
              <h3 className="text-lg font-semibold leading-7 text-white">{title}</h3>
            </div>
            <p className="mt-1 truncate text-sm text-slate-400">{group.representativeAddress || "Representative address unavailable"}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {!done && selected ? (
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-cyan-300/28 bg-cyan-300/12 text-sm text-cyan-100">
                ✓
              </span>
            ) : null}
            <TooltipTag
              className={classNames(
                "shrink-0 rounded-full border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em]",
                done
                  ? "border-white/10 bg-white/6 text-slate-300"
                  : sensitiveFinancial
                  ? "border-amber-300/22 bg-amber-300/10 text-amber-100"
                  : actionable
                    ? "border-white/10 bg-white/6 text-slate-300"
                    : "border-white/8 bg-black/18 text-slate-400",
              )}
              description={statusTooltip}
            >
              {statusLabel}
            </TooltipTag>
          </div>
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
            {showManualUnsubscribeChip ? (
              <ManualUnsubscribeChip onClick={() => onOpenManualDetails(group)} />
            ) : (
              <TooltipTag
                className={classNames(
                  "rounded-full border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em]",
                  getUnsubscribeTone(group.unsubscribe),
                )}
                description={ACTIONABILITY_TOOLTIPS[group.unsubscribe?.resolutionStatus] || null}
              >
                {getUnsubscribeLabel(group.unsubscribe)}
              </TooltipTag>
            )}
          </div>
        </div>

        {showUnsubscribeSeverSurface ? (
          <UnsubscribeSeverSurface
            armed={armedActionType === "unsubscribe" && !hasExecutionStarted(unsubscribeExecution)}
            execution={unsubscribeExecution}
            group={group}
            reducedMotion={reducedMotion}
          />
        ) : null}

        {doneSummary ? (
          <div className="mt-4 rounded-[20px] border border-white/10 bg-white/5 px-3 py-3 text-sm text-slate-200">
            <p className="font-medium text-white">{doneSummary}</p>
            <p className="mt-1 text-xs leading-5 text-slate-400">Completed in this session only. A fresh scan can rediscover this sender.</p>
          </div>
        ) : null}

        {!done && executionCards.length > 0 ? (
          <div className="mt-4 grid gap-2">
            {executionCards.map(({ actionType, description, execution }) => (
              <div
                key={`${group.id}-${actionType}`}
                className={classNames(
                  "rounded-[18px] border px-3 py-3 text-sm",
                  getExecutionTone(execution),
                )}
              >
                <p className="font-medium">{getExecutionLabel(actionType, execution)}</p>
                {description ? <p className="mt-1 text-xs leading-5">{description}</p> : null}
              </div>
            ))}
          </div>
        ) : null}

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

export function ProductionScanScreen({ authConfigured, autoAdvance = true, email, gmailAuthState, initialScan, workflowExecutionMode = "LIVE" }) {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const [scan, setScan] = useState(initialScan);
  const [errorMessage, setErrorMessage] = useState(null);
  const [requestState, setRequestState] = useState("idle");
  const [executionRequestState, setExecutionRequestState] = useState("idle");
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectionDecision, setSelectionDecision] = useState(null);
  const [selectionWorkflow, setSelectionWorkflow] = useState(null);
  const [manualDetailsGroups, setManualDetailsGroups] = useState([]);
  const [activeResultTab, setActiveResultTab] = useState("active");
  const [sortMode, setSortMode] = useState("discovery");
  const [categoryFilters, setCategoryFilters] = useState([]);
  const autoAdvanceVersionRef = useRef(0);

  const senderGroups = scan?.senderGroups || [];
  const activeSelectionWorkflow = selectionWorkflow?.scan?.scanId === scan?.scanId
    ? selectionWorkflow
    : null;
  const selectionWorkflowGroupById = new Map((activeSelectionWorkflow?.scan?.senderGroups || []).map((group) => [group.id, group]));
  const resolvedSenderGroups = senderGroups.map((group) => selectionWorkflowGroupById.get(group.id) || group);
  const activeSenderGroups = resolvedSenderGroups.filter((group) => !isGroupDone(group));
  const doneSenderGroups = resolvedSenderGroups.filter((group) => isGroupDone(group));
  const activeGroupById = new Map(activeSenderGroups.map((group) => [group.id, group]));
  const pauseSettling = scan?.state === SCAN_STATES.PAUSED && hasPendingPauseWork(scan);
  const pausing = requestState === "pause" || pauseSettling;
  const activeScan = Boolean(scan && ACTIVE_SCAN_STATES.has(scan.state));
  const filteredGroups = categoryFilters.length === 0
    ? activeSenderGroups
    : activeSenderGroups.filter((group) => categoryFilters.includes(group.category || SENDER_CATEGORIES.UNKNOWN));
  const visibleGroups = sortGroupsForDisplay(filteredGroups, sortMode);
  const visibleActionableGroupIds = visibleGroups
    .filter((group) => isGroupActionable(group))
    .map((group) => group.id);
  const selectedGroups = selectedIds
    .map((id) => activeGroupById.get(id))
    .filter(Boolean);
  const selectedManualGroups = selectedGroups.filter((group) => hasManualOnlyUnsubscribeAction(group));
  const selectedGroupIdSet = new Set(selectedGroups.map((group) => group.id));
  const selectedCount = selectedGroups.length;
  const hasSelectedRunningExecution = selectedGroups.some((group) => hasGroupRunningExecution(group));
  const allVisibleActionableSelected = visibleActionableGroupIds.length > 0
    && visibleActionableGroupIds.every((id) => selectedGroupIdSet.has(id));
  const visibleResultTab = activeResultTab === "done" && doneSenderGroups.length > 0
    ? "done"
    : "active";
  const showManualDetailsModal = manualDetailsGroups.length > 0;
  const selectionSnapshot = buildSelectionSnapshot(selectedGroups);
  const selectionActionSummary = getSelectionActionSummary(selectionSnapshot);
  const activeSelectionDecision = selectionDecision === "unsubscribe" && !selectionActionSummary?.unsubscribe.enabled
    ? null
    : selectionDecision === "cleanup" && !selectionActionSummary?.cleanup.enabled
      ? null
      : selectionDecision;
  const decisionExecutionSummary = activeSelectionDecision
    ? buildExecutionSummary({
        actionType: activeSelectionDecision,
        groups: selectedGroups,
      })
    : null;
  const reviewableGroupCount = getReviewableGroupCount(senderGroups);
  const presentation = derivePresentation(scan, gmailAuthState);
  const effectivePresentation = pausing
    ? {
        ...presentation,
        accent: "slate",
        actionLabel: "Pausing...",
        actionType: null,
        body: "No new mail is being fetched. Finishing what's already in motion.",
        eyebrow: "Pausing",
        title: "Pausing...",
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
  const sortDescription = getSortDescription(sortMode);
  const discoveryTitle = scan?.state === SCAN_STATES.COMPLETE
    ? "Sender groups are ready for review."
    : pausing || scan?.state === SCAN_STATES.PAUSED || scan?.state === SCAN_STATES.RESOURCE_LIMIT_REACHED
      ? "These are the senders Pidgeot has already found."
      : "These are the senders Pidgeot is finding.";
  const discoveryBody = scan?.state === SCAN_STATES.COMPLETE
    ? null
    : pausing
      ? "No new mail is being fetched while already-started work settles into the current discovery set."
      : scan?.state === SCAN_STATES.PAUSED
        ? "Nothing new is being fetched. The current discovery set will stay still until you resume."
        : scan?.state === SCAN_STATES.RESOURCE_LIMIT_REACHED
          ? "This local run stopped at the development scan cap. The results below are the preserved partial discovery set."
          : "Live discoveries stay visible here while Pidgeot keeps scanning. Sensitive financial mail stays out of cleanup.";
  const primaryActionDisabled = !effectivePresentation.actionType || pausing || (
    requestState !== "idle" && !(requestState === "auto-resume" && effectivePresentation.actionType === "pause")
  );

  useEffect(() => {
    if (!scan?.scanId || selectedCount === 0) {
      return undefined;
    }

    let cancelled = false;

    const timeoutId = window.setTimeout(async () => {
      try {
        const payload = await readJson("/api/workflow/status");

        if (cancelled) {
          return;
        }

        setSelectionWorkflow(payload.workflow || null);
        if (payload.workflow?.scan) {
          setScan(payload.workflow.scan);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error.message || "The latest workflow status could not be loaded.");
        }
      }
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [scan?.scanId, scan?.updatedAt, selectedCount]);

  useEffect(() => {
    if (!scan?.scanId || !hasSelectedRunningExecution) {
      return undefined;
    }

    let cancelled = false;

    const timeoutId = window.setTimeout(async () => {
      try {
        const payload = await readJson("/api/workflow/status");

        if (cancelled) {
          return;
        }

        setSelectionWorkflow(payload.workflow || null);
        if (payload.workflow?.scan) {
          setScan(payload.workflow.scan);
        }
        setErrorMessage(null);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error.message || "The latest workflow status could not be loaded.");
        }
      }
    }, 260);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [hasSelectedRunningExecution, scan?.scanId, selectionWorkflow]);

  useEffect(() => {
    if (!pauseSettling || requestState !== "idle") {
      return undefined;
    }

    const timeoutId = window.setTimeout(async () => {
      try {
        const payload = await readJson("/api/scan/status");
        setScan(payload.scan);
        setErrorMessage(null);
      } catch (error) {
        setErrorMessage(error.message || "The latest scan status could not be loaded.");
      }
    }, 650);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [pauseSettling, requestState, scan]);

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
  }

  function clearSelection() {
    if (hasSelectedRunningExecution) {
      return;
    }

    setSelectionDecision(null);
    setSelectedIds([]);
  }

  function selectAllVisibleActionable() {
    if (hasSelectedRunningExecution || visibleActionableGroupIds.length === 0) {
      return;
    }

    setSelectionDecision(null);
    setSelectedIds((current) => {
      const next = new Set(current.filter((id) => activeGroupById.has(id)));

      visibleActionableGroupIds.forEach((id) => {
        next.add(id);
      });

      return Array.from(next);
    });
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
      setRequestState(actionType);
      const payload = await readJson(target, { method: "POST" });
      setScan(payload.scan);
      if (actionType === "start") {
        setManualDetailsGroups([]);
        setSelectedIds([]);
        setSelectionDecision(null);
        setSelectionWorkflow(null);
        setActiveResultTab("active");
      }
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error.message || "The scan action could not be completed.");
    } finally {
      setRequestState("idle");
    }
  }

  function toggleSelection(groupId) {
    const group = activeGroupById.get(groupId);

    if (!isGroupActionable(group) || hasSelectedRunningExecution) {
      return;
    }

    setSelectionDecision(null);

    setSelectedIds((current) => (
      current.includes(groupId)
        ? current.filter((id) => id !== groupId)
        : [...current, groupId]
    ));
  }

  async function handleSelectionExecution() {
    if (!activeSelectionDecision || executionRequestState !== "idle" || hasSelectedRunningExecution) {
      return;
    }

    const executableGroups = selectedGroups.filter((group) => {
      if (activeSelectionDecision === "unsubscribe") {
        return hasExecutableUnsubscribeAction(group);
      }

      return getGroupCleanupEligibleCount(group) > 0 || hasExecutionStarted(group?.workflow?.cleanupExecution);
    });

    if (executableGroups.length === 0) {
      return;
    }

    try {
      setExecutionRequestState("submitting");
      const payload = await readJson("/api/workflow/execute", {
        body: JSON.stringify({
          selections: executableGroups.map((group) => ({
            actions: {
              cleanup: activeSelectionDecision === "cleanup",
              unsubscribe: activeSelectionDecision === "unsubscribe",
            },
            senderGroupId: group.id,
          })),
        }),
        method: "POST",
      });

      setSelectionWorkflow(payload.workflow || null);
      if (payload.workflow?.scan) {
        setScan(payload.workflow.scan);
      }
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error.message || "The workflow request could not be completed.");
    } finally {
      setExecutionRequestState("idle");
    }
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
      {showManualDetailsModal ? (
        <ManualUnsubscribeDetailsModal
          groups={manualDetailsGroups}
          onClose={() => setManualDetailsGroups([])}
          reducedMotion={reducedMotion}
        />
      ) : null}

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
                    disabled={primaryActionDisabled}
                  onClick={() => handleScanAction(effectivePresentation.actionType)}
                  type="button"
                >
                    {getActionButtonLabel({
                      actionLabel: effectivePresentation.actionLabel,
                      pausing,
                      requestState,
                    })}
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
                {scan.resourceLimit.code === "DEVELOPMENT_MESSAGE_LIMIT"
                  ? `${scan.resourceLimit.message} Everything already discovered stays available below.`
                  : `Scan stopped after ${scan.resourceLimit.currentMessageCount} retained messages out of the current limit of ${scan.resourceLimit.maxRetainedMessages}. Everything already discovered stays available below.`}
              </div>
            ) : null}

            {scan?.state === SCAN_STATES.PARTIAL_RESULTS_AVAILABLE && !pausing ? (
              <div className="rounded-[22px] border border-cyan-300/24 bg-cyan-300/10 px-4 py-3 text-sm text-cyan-100">
                Pidgeot is still looking. But it has already found sender groups you can start reviewing now.
              </div>
            ) : null}

            {workflowExecutionMode === "SIMULATED" ? (
              <div className="rounded-[22px] border border-cyan-300/24 bg-cyan-300/8 px-4 py-3 text-sm text-cyan-100">
                SIMULATION MODE — Gmail won&apos;t be changed.
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
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-white">{discoveryTitle}</h2>
            {discoveryBody ? (
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                {discoveryBody}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <CounterBadge label="Selected" value={selectedCount} />
            <CounterBadge label="Mailbox" value={email} />
          </div>
        </div>

        <div className="mt-5 border-b border-white/10">
          <div className="flex gap-6">
            <button
              aria-selected={visibleResultTab === "active"}
              className={classNames(
                "border-b-2 px-0 pb-3 pt-1 text-sm font-semibold transition-colors duration-200",
                visibleResultTab === "active"
                  ? "border-cyan-300 text-white"
                  : "border-transparent text-slate-400 hover:text-slate-200",
              )}
              onClick={() => setActiveResultTab("active")}
              role="tab"
              type="button"
            >
              {`Active ${formatCount(activeSenderGroups.length)}`}
            </button>
            <button
              aria-selected={visibleResultTab === "done"}
              className={classNames(
                "border-b-2 px-0 pb-3 pt-1 text-sm font-semibold transition-colors duration-200",
                visibleResultTab === "done"
                  ? "border-cyan-300 text-white"
                  : "border-transparent text-slate-400 hover:text-slate-200",
              )}
              onClick={() => setActiveResultTab("done")}
              role="tab"
              type="button"
            >
              {`Done ${formatCount(doneSenderGroups.length)}`}
            </button>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {visibleResultTab === "active" && selectedCount > 0 && selectionActionSummary ? (
            <SelectionActionBar
              actionSummary={selectionActionSummary}
              activeDecision={activeSelectionDecision}
              executionRequestState={executionRequestState}
              executionSummary={decisionExecutionSummary}
              hasRunningExecution={hasSelectedRunningExecution}
              onDecisionChange={setSelectionDecision}
              onExecute={handleSelectionExecution}
              onOpenManualDetails={() => setManualDetailsGroups(selectedManualGroups)}
              reducedMotion={reducedMotion}
              selectedCount={selectedCount}
              workflowExecutionMode={workflowExecutionMode}
            />
          ) : null}
        </AnimatePresence>

        {visibleResultTab === "active" ? (
          <div className="mt-5 flex flex-col gap-4 rounded-[24px] border border-white/10 bg-[rgba(8,14,25,0.72)] p-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
              <label className="grid min-w-[240px] gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">Sort by</span>
                <span className="relative flex min-w-[240px] items-center">
                  <select
                    className="min-h-[50px] w-full appearance-none rounded-2xl border border-white/12 bg-[rgba(7,11,19,0.92)] px-4 py-3 pr-10 text-sm text-white outline-none transition-colors duration-200 hover:border-white/24 focus:border-cyan-300/40"
                    onChange={(event) => handleSortChange(event.target.value)}
                    value={sortMode}
                  >
                    <option value="discovery">Live discovery order</option>
                    <option value="unread-desc">Unread: highest first</option>
                    <option value="unread-asc">Unread: lowest first</option>
                  </select>
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-500">▾</span>
                </span>
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

              <BulkSelectionControls
                allVisibleSelected={allVisibleActionableSelected}
                disabled={hasSelectedRunningExecution}
                onClearAll={clearSelection}
                onSelectAll={selectAllVisibleActionable}
                selectedCount={selectedCount}
                visibleSelectableCount={visibleActionableGroupIds.length}
              />
            </div>

            <div className="grid gap-1 text-right">
              <p className="text-sm text-slate-400">
                Showing <span className="font-semibold text-white">{visibleGroups.length}</span> of <span className="font-semibold text-white">{activeSenderGroups.length}</span> active groups.
              </p>
              <p className="text-xs text-slate-500">{sortDescription}</p>
            </div>
          </div>
        ) : (
          <div className="mt-5 flex items-center justify-between rounded-[24px] border border-white/10 bg-[rgba(8,14,25,0.72)] px-4 py-3 text-sm text-slate-400">
            <p>Completed senders stay here for this workflow session only.</p>
            <p><span className="font-semibold text-white">{doneSenderGroups.length}</span> handled</p>
          </div>
        )}

        {visibleResultTab === "active" && scan?.state === SCAN_STATES.COMPLETE && activeSenderGroups.length === 0 ? (
          <div className="mt-5 rounded-[24px] border border-white/10 bg-[rgba(8,14,25,0.76)] px-5 py-12 text-center">
            <p className="text-lg font-semibold text-white">Pidgeot completed the scan but did not find active sender groups to review yet.</p>
            <p className="mt-2 text-sm text-slate-400">Try another scan later after new mail arrives.</p>
          </div>
        ) : visibleResultTab === "active" && visibleGroups.length === 0 ? (
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
        ) : visibleResultTab === "done" && doneSenderGroups.length === 0 ? (
          <div className="mt-5 rounded-[24px] border border-white/10 bg-[rgba(8,14,25,0.76)] px-5 py-12 text-center">
            <p className="text-lg font-semibold text-white">No senders are done yet.</p>
            <p className="mt-2 text-sm text-slate-400">Completed simulated actions will collect here without changing Gmail.</p>
          </div>
        ) : (
          <LayoutGroup>
            <div className="mt-5 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              <AnimatePresence initial={false}>
                {(visibleResultTab === "active" ? visibleGroups : doneSenderGroups).map((group) => (
                  <motion.div
                    key={group.id}
                    layout
                    initial={reducedMotion ? false : { opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reducedMotion ? undefined : { opacity: 0, y: -10 }}
                    transition={{ duration: reducedMotion ? 0 : 0.22 }}
                  >
                    <SenderGroupCard
                      armedActionType={selectedGroupIdSet.has(group.id) ? activeSelectionDecision : null}
                      group={group}
                      mode={visibleResultTab === "done" ? "done" : "active"}
                      onOpenManualDetails={(nextGroup) => setManualDetailsGroups([nextGroup])}
                      onToggle={() => toggleSelection(group.id)}
                      reducedMotion={reducedMotion}
                      selected={selectedGroupIdSet.has(group.id)}
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