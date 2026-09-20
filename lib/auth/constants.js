export const IDENTITY_AUTH_SCOPES = ["openid", "email"];
export const GMAIL_MODIFY_SCOPE = "https://www.googleapis.com/auth/gmail.modify";
export const GMAIL_AUTH_SCOPES = [...IDENTITY_AUTH_SCOPES, GMAIL_MODIFY_SCOPE];

export const GOOGLE_AUTH_FLOWS = {
	GMAIL: "gmail",
	IDENTITY: "identity",
};

export const GMAIL_SESSION_STATES = {
	CONSENT_REQUIRED: "CONSENT_REQUIRED",
	GMAIL_READY: "GMAIL_READY",
	IDENTITY_ONLY: "IDENTITY_ONLY",
	REAUTH_REQUIRED: "REAUTH_REQUIRED",
};

export const ACTIVE_SESSION_COOKIE_NAME = "pidgeot_session";
export const OAUTH_STATE_COOKIE_NAME = "pidgeot_oauth_state";

export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;