import { ACTIVE_SESSION_COOKIE_NAME, OAUTH_STATE_COOKIE_NAME } from "@/lib/auth/constants";
import { SESSION_TTL_MS_PER_HOUR } from "@/lib/config";

const SESSION_TTL_SECONDS_PER_HOUR = SESSION_TTL_MS_PER_HOUR / 1000;

export function buildSessionCookieOptions(config) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: config.isProduction,
    maxAge: config.sessionTtlHours * SESSION_TTL_SECONDS_PER_HOUR,
  };
}

export function buildOAuthStateCookieOptions(config) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: config.isProduction,
    maxAge: 10 * 60,
  };
}

export function clearAuthCookies(response) {
  response.cookies.delete(ACTIVE_SESSION_COOKIE_NAME);
  response.cookies.delete(OAUTH_STATE_COOKIE_NAME);
}