import { GMAIL_SESSION_STATES } from "@/lib/auth/constants";
import { SCAN_STATES } from "@/lib/scanning/constants";

export const ACTIVE_SCAN_STATES = new Set([
  SCAN_STATES.DISCOVERING,
  SCAN_STATES.PARTIAL_RESULTS_AVAILABLE,
]);

export const RITUAL_STAGES = {
  CLASSIFYING: "CLASSIFYING",
  DISCOVERING: "DISCOVERING",
  GROUPING: "GROUPING",
  READY: "READY",
};

export function formatLabel(value) {
  if (!value) {
    return "Unknown";
  }

  return value
    .toString()
    .toLowerCase()
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function getGroupTitle(group) {
  return group.displayName || group.representativeDomain || group.representativeAddress || "Unknown sender";
}

export function getUnsubscribeLabel(unsubscribe) {
  if (!unsubscribe) {
    return "Unsubscribe unknown";
  }

  switch (unsubscribe.resolutionStatus) {
    case "ONE_CLICK_READY":
      return "One-click available";
    case "MANUAL_ACTION_REQUIRED":
      return "Manual unsubscribe";
    case "UNAVAILABLE":
      return "No unsubscribe path";
    default:
      return formatLabel(unsubscribe.resolutionStatus);
  }
}

export function deriveRitualStage(scan) {
  if (!scan) {
    return RITUAL_STAGES.READY;
  }

  if (scan.state === SCAN_STATES.DISCOVERING) {
    return RITUAL_STAGES.DISCOVERING;
  }

  if (scan.state === SCAN_STATES.PARTIAL_RESULTS_AVAILABLE) {
    const senderGroups = Array.isArray(scan.senderGroups) ? scan.senderGroups : [];

    if (senderGroups.some((group) => group.category && group.category !== "UNKNOWN")) {
      return RITUAL_STAGES.CLASSIFYING;
    }

    if (senderGroups.length > 0) {
      return RITUAL_STAGES.GROUPING;
    }

    return RITUAL_STAGES.DISCOVERING;
  }

  if (scan.state === SCAN_STATES.COMPLETE) {
    return RITUAL_STAGES.READY;
  }

  return null;
}

export function derivePresentation(scan, gmailAuthState) {
  if (gmailAuthState !== GMAIL_SESSION_STATES.GMAIL_READY) {
    if (gmailAuthState === GMAIL_SESSION_STATES.REAUTH_REQUIRED) {
      return {
        accent: "cyan",
        actionLabel: "Reconnect Gmail access",
        actionType: "gmail-upgrade",
        body: "Gmail access needs to be restored before Pidgeot can continue the scan you started.",
        eyebrow: "Reconnect Gmail",
        title: "Reconnect Gmail to keep going.",
        tone: "warning",
        visualMode: "paused",
      };
    }

    return {
      accent: "yellow",
      actionLabel: gmailAuthState === GMAIL_SESSION_STATES.CONSENT_REQUIRED ? "Grant Gmail access" : "Enable Gmail access",
      actionType: "gmail-upgrade",
      body: "Pidgeot needs permission to look at your Gmail before the first scan can begin.",
      eyebrow: "Gmail access",
      title: "Connect Gmail to begin.",
      tone: "warning",
      visualMode: "idle",
    };
  }

  if (!scan) {
    return {
      accent: "cyan",
      actionLabel: "Scan inbox",
      actionType: "start",
      body: "Pidgeot is ready to look through your Gmail and surface the recurring senders filling your inbox.",
      eyebrow: "First scan",
      title: "Start your first scan.",
      tone: "ready",
      visualMode: "idle",
    };
  }

  const ritualStage = deriveRitualStage(scan);

  switch (scan.state) {
    case SCAN_STATES.DISCOVERING:
      return {
        accent: "cyan",
        actionLabel: "Pause scan",
        actionType: "pause",
        body: "Pidgeot is looking through your inbox and gathering the recurring senders that keep showing up.",
        eyebrow: "Discovering",
        title: "Pidgeot is looking through your inbox.",
        tone: "active",
        visualMode: "scanning",
      };
    case SCAN_STATES.PARTIAL_RESULTS_AVAILABLE:
      return {
        accent: "yellow",
        actionLabel: "Pause scan",
        actionType: "pause",
        body: ritualStage === RITUAL_STAGES.CLASSIFYING
          ? "Pidgeot is still looking, and the sender groups it has already found are settling into clearer categories."
          : "Pidgeot is still looking, and the sender groups it has already found are already visible below.",
        eyebrow: ritualStage === RITUAL_STAGES.CLASSIFYING ? "Classifying" : "Grouping",
        title: ritualStage === RITUAL_STAGES.CLASSIFYING
          ? "Pidgeot is sorting what it has already found."
          : "Pidgeot is still looking. But results are already appearing.",
        tone: "active",
        visualMode: "scanning",
      };
    case SCAN_STATES.PAUSED:
      return {
        accent: "slate",
        actionLabel: "Resume scan",
        actionType: "resume",
        body: scan.pauseReason === "USER_REQUESTED"
          ? "Nothing new is being fetched. Everything Pidgeot has already found stays visible."
          : "Nothing new is being fetched until Pidgeot can continue from the existing checkpoint.",
        eyebrow: "Paused",
        title: "Paused.",
        tone: "paused",
        visualMode: "paused",
      };
    case SCAN_STATES.COMPLETE:
      return {
        accent: "emerald",
        actionLabel: "Scan again",
        actionType: "start",
        body: scan.senderGroups.length > 0
          ? "The first scan is complete. These are the senders filling your inbox."
          : "Pidgeot finished the scan but did not find sender groups worth surfacing yet.",
        eyebrow: "Ready",
        title: "Your inbox is ready to review.",
        tone: "complete",
        visualMode: "settled",
      };
    case SCAN_STATES.RESOURCE_LIMIT_REACHED:
      if (scan.resourceLimit?.code === "DEVELOPMENT_MESSAGE_LIMIT") {
        return {
          accent: "yellow",
          actionLabel: "Scan again",
          actionType: "start",
          body: Number.isFinite(scan.resourceLimit?.maxRetainedMessages)
            ? `Showing the first ${scan.resourceLimit.maxRetainedMessages} messages for this scan.`
            : "Showing the messages found for this scan.",
          eyebrow: "Scan limit",
          title: "Scan limit reached.",
          tone: "warning",
          visualMode: "stopped",
        };
      }

      return {
        accent: "yellow",
        actionLabel: null,
        actionType: null,
        body: scan.resourceLimit?.message || "Scanning stopped because the current scan limit was reached.",
        eyebrow: "Scan limit reached",
        title: "Pidgeot reached the scan limit and kept what it already found.",
        tone: "warning",
        visualMode: "stopped",
      };
    case SCAN_STATES.REAUTH_REQUIRED:
      return {
        accent: "yellow",
        actionLabel: "Reconnect Gmail access",
        actionType: "gmail-upgrade",
        body: scan.failure?.message || "Gmail access needs to be restored before Pidgeot can continue the scan.",
        eyebrow: "Reconnect Gmail",
        title: "Scanning stopped because Gmail needs to be reconnected.",
        tone: "warning",
        visualMode: "stopped",
      };
    case SCAN_STATES.FAILED:
      return {
        accent: "rose",
        actionLabel: "Try scan again",
        actionType: "start",
        body: scan.failure?.message || "The scan stopped before Pidgeot could finish looking through your inbox.",
        eyebrow: "Scan failed",
        title: "This scan stopped early.",
        tone: "error",
        visualMode: "error",
      };
    default:
      return {
        accent: "slate",
        actionLabel: null,
        actionType: null,
        body: "Pidgeot is waiting for the next scanning instruction.",
        eyebrow: "Waiting",
        title: "Scan status is available.",
        tone: "ready",
        visualMode: "idle",
      };
  }
}