import { describe, expect, it } from "vitest";

import {
  buildUrlWithoutTransientAuthStatus,
  getAuthStatusNotification,
} from "@/lib/auth/auth-status";

describe("auth status helpers", () => {
  it("returns a success notification for auth=success", () => {
    const searchParams = new URLSearchParams("auth=success");

    expect(getAuthStatusNotification(searchParams)).toMatchObject({
      code: "success",
      kind: "auth",
      message: "You’re signed in. Connect Gmail when you’re ready for Pidgeot to inspect your inbox.",
      tone: "success",
    });
  });

  it("returns a Gmail-capable notification for auth=gmail_connected", () => {
    const searchParams = new URLSearchParams("auth=gmail_connected");

    expect(getAuthStatusNotification(searchParams)).toMatchObject({
      code: "gmail_connected",
      kind: "auth",
      label: "Inbox connected",
      tone: "success",
    });
  });

  it("does not expose deferred-phase language in auth notifications", () => {
    expect(getAuthStatusNotification(new URLSearchParams("auth=success")).message.toLowerCase()).not.toContain("deferred");
    expect(getAuthStatusNotification(new URLSearchParams("auth=gmail_connected")).message.toLowerCase()).not.toContain("server memory");
  });

  it("prefers authError over auth when both are present", () => {
    const searchParams = new URLSearchParams("auth=success&authError=state");

    expect(getAuthStatusNotification(searchParams)).toMatchObject({
      code: "state",
      kind: "authError",
      tone: "error",
    });
  });

  it("removes transient auth params and preserves unrelated query params", () => {
    const searchParams = new URLSearchParams("auth=success&tab=queue&authError=state");

    expect(buildUrlWithoutTransientAuthStatus("/", searchParams)).toBe("/?tab=queue");
  });

  it("returns the plain pathname when no other params remain", () => {
    const searchParams = new URLSearchParams("auth=signed_out");

    expect(buildUrlWithoutTransientAuthStatus("/", searchParams)).toBe("/");
  });
});