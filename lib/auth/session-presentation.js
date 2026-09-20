import { sanitizeSessionForClient } from "@/lib/auth/gmail-session";

export function buildAuthenticatedSessionResponse(session) {
  return {
    authenticated: true,
    session: sanitizeSessionForClient(session),
  };
}