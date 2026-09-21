import { GMAIL_SESSION_STATES } from "@/lib/auth/constants";

export function getEntryFlowState({ authConfigured, email, gmailAuthState }) {
  if (!authConfigured) {
    return {
      description:
        "Pidgeot is ready for the front door, but Google sign-in is not configured in this environment yet.",
      primaryAction: null,
      stage: "config",
      supportingText: "Add the existing Google OAuth environment variables to enable sign-in.",
      title: "Pidgeot is not configured for sign-in here yet.",
    };
  }

  if (!email) {
    return {
      description:
        "Find recurring senders, newsletters and low-value mail hiding in your Gmail. Pidgeot groups the noise so you can decide what to keep, unsubscribe from, or clean up.",
      primaryAction: {
        action: "/api/auth/google/start",
        kind: "form",
        label: "Continue with Google",
      },
      stage: "public",
      supportingText:
        "Google sign-in creates your Pidgeot session first. Gmail access is requested separately in the next step.",
      title: "Make sense of the inbox you already have.",
    };
  }

  if (gmailAuthState === GMAIL_SESSION_STATES.GMAIL_READY) {
    return {
      description: "Ready to see what has been piling up in your inbox?",
      primaryAction: {
        kind: "button",
        label: "Scan my inbox",
      },
      stage: "ready",
      supportingText: "Inbox scanning is the next step from here.",
      title: "Your inbox is connected.",
    };
  }

  if (gmailAuthState === GMAIL_SESSION_STATES.REAUTH_REQUIRED) {
    return {
      description:
        "Gmail access needs to be restored before Pidgeot can continue scanning your inbox.",
      primaryAction: {
        action: "/api/auth/google/gmail/start",
        kind: "form",
        label: "Reconnect Gmail",
      },
      stage: "reauth",
      supportingText: "Reconnect Gmail to return to your inbox scan and the sender groups Pidgeot has already found.",
      title: "Gmail needs to be reconnected.",
    };
  }

  return {
    description:
      "Pidgeot needs access to your Gmail to find the subscriptions and recurring senders filling your inbox.",
    primaryAction: {
      action: "/api/auth/google/gmail/start",
      kind: "form",
      label: gmailAuthState === GMAIL_SESSION_STATES.CONSENT_REQUIRED ? "Connect Gmail" : "Connect Gmail",
    },
    stage: "connect-gmail",
    supportingText: "Google sign-in is complete. Gmail permission is the step that lets Pidgeot begin the first real scan.",
    title: "You’re in.",
  };
}