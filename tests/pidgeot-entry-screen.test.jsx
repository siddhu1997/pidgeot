import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { PidgeotEntryScreen } from "@/components/entry/pidgeot-entry-screen";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }) => createElement("a", { href, ...props }, children),
}));

describe("pidgeot entry screen", () => {
  beforeAll(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation((query) => ({
        addEventListener: vi.fn(),
        addListener: vi.fn(),
        dispatchEvent: vi.fn(),
        matches: false,
        media: query,
        onchange: null,
        removeEventListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    });
  });

  it("shows the Gmail connection step after identity sign-in", () => {
    render(createElement(PidgeotEntryScreen, {
      authConfigured: true,
      email: "user@example.com",
      gmailAuthState: "IDENTITY_ONLY",
    }));

    expect(screen.getByRole("heading", { name: "You’re in." })).toBeInTheDocument();
    expect(screen.getByText("Pidgeot needs access to your Gmail to find the subscriptions and recurring senders filling your inbox.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect Gmail" })).toBeInTheDocument();
  });
});