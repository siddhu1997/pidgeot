const AUTH_NOTIFICATION_COPY = {
  cancelled: {
    code: "cancelled",
    kind: "auth",
    label: "Sign-in stopped",
    message: "Google sign-in was cancelled before the session was created.",
    tone: "warning",
  },
  signed_out: {
    code: "signed_out",
    kind: "auth",
    label: "Session ended",
    message: "The local Pidgeot session has been cleared.",
    tone: "neutral",
  },
  success: {
    code: "success",
    kind: "auth",
    label: "Signed in",
    message: "You’re signed in. Connect Gmail when you’re ready for Pidgeot to inspect your inbox.",
    tone: "success",
  },
  gmail_connected: {
    code: "gmail_connected",
    kind: "auth",
    label: "Inbox connected",
    message: "Gmail is connected. You can move into Pidgeot and start from a ready inbox.",
    tone: "success",
  },
  gmail_consent_required: {
    code: "gmail_consent_required",
    kind: "auth",
    label: "Gmail consent required",
    message: "Google sign-in worked, but Gmail access still needs your permission.",
    tone: "warning",
  },
};

const AUTH_ERROR_NOTIFICATION_COPY = {
  config: {
    code: "config",
    kind: "authError",
    label: "Sign-in unavailable",
    message: "Google OAuth is not configured yet for this environment.",
    tone: "error",
  },
  denied: {
    code: "denied",
    kind: "authError",
    label: "Access denied",
    message: "Google sign-in was denied before the session could be created.",
    tone: "error",
  },
  exchange: {
    code: "exchange",
    kind: "authError",
    label: "Sign-in failed",
    message: "Pidgeot could not finish Google sign-in. Please try again.",
    tone: "error",
  },
  gmail_reauth_required: {
    code: "gmail_reauth_required",
    kind: "authError",
    label: "Reconnect Gmail access",
    message: "Gmail access needs to be connected again before Pidgeot can continue.",
    tone: "error",
  },
  expired_state: {
    code: "expired_state",
    kind: "authError",
    label: "Sign-in expired",
    message: "The OAuth state expired before the callback completed. Please try again.",
    tone: "error",
  },
  state: {
    code: "state",
    kind: "authError",
    label: "State mismatch",
    message: "Pidgeot could not verify the Google callback, so the session was not created.",
    tone: "error",
  },
};

export function getAuthStatusNotification(searchParams) {
  const authErrorCode = searchParams.get("authError");

  if (authErrorCode && AUTH_ERROR_NOTIFICATION_COPY[authErrorCode]) {
    return AUTH_ERROR_NOTIFICATION_COPY[authErrorCode];
  }

  const authCode = searchParams.get("auth");

  if (authCode && AUTH_NOTIFICATION_COPY[authCode]) {
    return AUTH_NOTIFICATION_COPY[authCode];
  }

  return null;
}

export function buildUrlWithoutTransientAuthStatus(pathname, searchParams) {
  const nextSearchParams = new URLSearchParams(searchParams.toString());
  nextSearchParams.delete("auth");
  nextSearchParams.delete("authError");

  const nextQueryString = nextSearchParams.toString();
  return nextQueryString ? `${pathname}?${nextQueryString}` : pathname;
}