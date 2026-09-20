import { GMAIL_SESSION_STATES } from "@/lib/auth/constants";
import { SCAN_STATES } from "@/lib/scanning/constants";

export const ACTIVE_SCAN_STATES = new Set([
  SCAN_STATES.DISCOVERING,
  SCAN_STATES.PARTIAL_RESULTS_AVAILABLE,
]);

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

export function derivePresentation(scan, gmailAuthState) {
  if (gmailAuthState !== GMAIL_SESSION_STATES.GMAIL_READY) {
    if (gmailAuthState === GMAIL_SESSION_STATES.REAUTH_REQUIRED) {
      return {
        accent: "cyan",
        actionLabel: "Reconnect Gmail access",
        actionType: "gmail-upgrade",
        body: "Pidgeot needs Gmail access again before it can continue scanning.",
        eyebrow: "Reconnect Gmail",
        title: "Reconnect Gmail to resume discovery.",
        tone: "warning",
        visualMode: "paused",
      };
    }

    return {
      accent: "yellow",
      actionLabel: gmailAuthState === GMAIL_SESSION_STATES.CONSENT_REQUIRED ? "Grant Gmail access" : "Enable Gmail access",
      actionType: "gmail-upgrade",
      body: "The scanner only starts after you explicitly grant Gmail modify access.",
      eyebrow: "Gmail access",
      title: "Enable Gmail before Pidgeot can scan.",
      tone: "warning",
      visualMode: "idle",
    };
  }

  if (!scan) {
    return {
      accent: "cyan",
      actionLabel: "Start scan",
      actionType: "start",
      body: "Pidgeot will begin discovering real sender groups from your Gmail session as soon as you start.",
      eyebrow: "Ready",
      title: "Start the first real inbox scan.",
      tone: "ready",
      visualMode: "idle",
    };
  }

  switch (scan.state) {
    case SCAN_STATES.DISCOVERING:
      return {
        accent: "cyan",
        actionLabel: "Pause scan",
        actionType: "pause",
        body: "Pidgeot is reading mailbox metadata and turning discovered messages into sender structure.",
        eyebrow: "Discovery",
        title: "Scanning your inbox now.",
        tone: "active",
        visualMode: "scanning",
      };
    case SCAN_STATES.PARTIAL_RESULTS_AVAILABLE:
      return {
        accent: "yellow",
        actionLabel: "Pause scan",
        actionType: "pause",
        body: "Pidgeot has found sender groups already and is still scanning for more.",
        eyebrow: "Partial results",
        title: "Real sender groups are appearing while the scan continues.",
        tone: "active",
        visualMode: "scanning",
      };
    case SCAN_STATES.PAUSED:
      return {
        accent: "slate",
        actionLabel: "Resume scan",
        actionType: "resume",
        body: scan.pauseReason === "USER_REQUESTED"
          ? "The scan is paused. Everything already discovered stays visible."
          : "Scanning paused before the next chunk of mailbox work could begin.",
        eyebrow: "Paused",
        title: "Scanning has stopped temporarily.",
        tone: "paused",
        visualMode: "paused",
      };
    case SCAN_STATES.COMPLETE:
      return {
        accent: "emerald",
        actionLabel: "Scan again",
        actionType: "start",
        body: scan.senderGroups.length > 0
          ? "The scan has settled into a stable sender surface that is ready for selection."
          : "Pidgeot completed the scan but did not find sender groups worth surfacing yet.",
        eyebrow: "Ready",
        title: "Your inbox has settled into reviewable sender groups.",
        tone: "complete",
        visualMode: "settled",
      };
    case SCAN_STATES.RESOURCE_LIMIT_REACHED:
      return {
        accent: "yellow",
        actionLabel: null,
        actionType: null,
        body: scan.resourceLimit?.message || "Scanning stopped because the configured scan limit was reached.",
        eyebrow: "Scan limit reached",
        title: "Pidgeot stopped at the scan limit and kept everything it already found.",
        tone: "warning",
        visualMode: "stopped",
      };
    case SCAN_STATES.REAUTH_REQUIRED:
      return {
        accent: "yellow",
        actionLabel: "Reconnect Gmail access",
        actionType: "gmail-upgrade",
        body: scan.failure?.message || "Gmail access needs to be refreshed before the scan can continue.",
        eyebrow: "Reconnect Gmail",
        title: "The scan stopped because Gmail needs to be reconnected.",
        tone: "warning",
        visualMode: "stopped",
      };
    case SCAN_STATES.FAILED:
      return {
        accent: "rose",
        actionLabel: "Start new scan",
        actionType: "start",
        body: scan.failure?.message || "The scan stopped unexpectedly before it could finish.",
        eyebrow: "Scan failed",
        title: "Pidgeot could not finish this scan.",
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