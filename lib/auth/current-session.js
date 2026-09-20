import { cookies } from "next/headers";

import { ACTIVE_SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { getActiveSessionStore } from "@/lib/auth/active-session-store";
import { getServerAppConfig } from "@/lib/config";

export async function getCurrentAuthSession() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(ACTIVE_SESSION_COOKIE_NAME)?.value;

  if (!sessionId) {
    return null;
  }

  const config = getServerAppConfig();
  const sessionStore = getActiveSessionStore(config);
  return sessionStore.getSession(sessionId);
}

export async function getRequiredCurrentAuthSession() {
  const session = await getCurrentAuthSession();

  if (!session) {
    const error = new Error("session_not_found");
    error.code = "session_not_found";
    throw error;
  }

  return session;
}