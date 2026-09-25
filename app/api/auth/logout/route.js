import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getActiveSessionStore } from "@/lib/auth/active-session-store";
import { buildSessionCookieOptions, clearAuthCookies } from "@/lib/auth/cookies";
import { ACTIVE_SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { getServerAppConfig } from "@/lib/config";

export const runtime = "nodejs";

export async function POST() {
  const config = getServerAppConfig();
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(ACTIVE_SESSION_COOKIE_NAME)?.value;

  if (sessionId) {
    const sessionStore = getActiveSessionStore(config);
    const currentSession = sessionStore.getSession(sessionId);

    if (currentSession?.accountKey) {
      sessionStore.destroySessionsForAccountKey(currentSession.accountKey);
    } else {
      sessionStore.destroySession(sessionId);
    }
  }

  const response = NextResponse.redirect(new URL("/?auth=signed_out", `${config.appBaseUrl}/`));
  clearAuthCookies(response);
  response.cookies.set(ACTIVE_SESSION_COOKIE_NAME, "", {
    ...buildSessionCookieOptions(config),
    maxAge: 0,
  });
  return response;
}