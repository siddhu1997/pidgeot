import { describe, expect, it } from "vitest";

import { getEntryFlowState } from "@/components/entry/pidgeot-entry-model";

describe("pidgeot entry model", () => {
  it("maps signed-out visitors to the public entry state", () => {
    expect(getEntryFlowState({
      authConfigured: true,
      email: null,
      gmailAuthState: "IDENTITY_ONLY",
    })).toEqual(expect.objectContaining({
      stage: "public",
      title: "Make sense of the inbox you already have.",
      primaryAction: expect.objectContaining({
        action: "/api/auth/google/start",
        label: "Continue with Google",
      }),
    }));
  });

  it("maps signed-in users without Gmail access to the connect step", () => {
    expect(getEntryFlowState({
      authConfigured: true,
      email: "user@example.com",
      gmailAuthState: "IDENTITY_ONLY",
    })).toEqual(expect.objectContaining({
      stage: "connect-gmail",
      title: "You’re signed in.",
      primaryAction: expect.objectContaining({
        action: "/api/auth/google/gmail/start",
        label: "Connect Gmail",
      }),
    }));
  });

  it("maps Gmail reauthentication to a reconnect state", () => {
    expect(getEntryFlowState({
      authConfigured: true,
      email: "user@example.com",
      gmailAuthState: "REAUTH_REQUIRED",
    })).toEqual(expect.objectContaining({
      stage: "reauth",
      primaryAction: expect.objectContaining({
        action: "/api/auth/google/gmail/start",
        label: "Reconnect Gmail",
      }),
    }));
  });

  it("maps Gmail-ready users to the ready shell", () => {
    expect(getEntryFlowState({
      authConfigured: true,
      email: "user@example.com",
      gmailAuthState: "GMAIL_READY",
    })).toEqual(expect.objectContaining({
      stage: "ready",
      title: "Your inbox is connected.",
      primaryAction: expect.objectContaining({
        kind: "button",
        label: "Scan my inbox",
      }),
    }));
  });

  it("keeps internal implementation language out of user-facing entry copy", () => {
    const copy = Object.values({
      public: getEntryFlowState({ authConfigured: true, email: null, gmailAuthState: "IDENTITY_ONLY" }),
      connect: getEntryFlowState({ authConfigured: true, email: "user@example.com", gmailAuthState: "CONSENT_REQUIRED" }),
      ready: getEntryFlowState({ authConfigured: true, email: "user@example.com", gmailAuthState: "GMAIL_READY" }),
    })
      .flatMap((state) => [state.title, state.description, state.supportingText])
      .join(" ")
      .toLowerCase();

    expect(copy).not.toContain("deferred");
    expect(copy).not.toContain("identity-only");
    expect(copy).not.toContain("gmail_ready");
    expect(copy).not.toContain("scan api");
  });
});