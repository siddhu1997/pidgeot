import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { ProductionScanScreen } from "@/components/scan/production-scan-screen";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }) => createElement("a", { href, ...props }, children),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

describe("production scan screen", () => {
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

  it("shows partial sender-group results before the scan is complete", () => {
    render(createElement(ProductionScanScreen, {
      authConfigured: true,
      autoAdvance: false,
      email: "user@example.com",
      gmailAuthState: "GMAIL_READY",
      initialScan: {
        counters: {
          messagesDiscovered: 18,
          messagesNormalized: 18,
          pagesProcessed: 2,
        },
        senderGroups: [
          {
            attention: "HIGH",
            category: "PROMOTIONAL",
            id: "group-1",
            messageCount: 12,
            representativeAddress: "store@example.com",
            representativeDomain: "example.com",
            senderDomains: ["example.com"],
            unreadCount: 4,
            unsubscribe: { resolutionStatus: "ONE_CLICK_READY" },
          },
          {
            attention: "LOW",
            category: "UNKNOWN",
            id: "group-2",
            messageCount: 6,
            representativeAddress: "updates@mailer.test",
            representativeDomain: "mailer.test",
            senderDomains: ["mailer.test"],
            unreadCount: 0,
            unsubscribe: { resolutionStatus: "UNAVAILABLE" },
          },
        ],
        sourceSummaries: {
          ACTIVE_MAIL: {
            messagesDiscovered: 18,
            pagesProcessed: 2,
          },
          TRASH: {
            messagesDiscovered: 0,
            pagesProcessed: 0,
          },
        },
        state: "PARTIAL_RESULTS_AVAILABLE",
      },
    }));

    expect(screen.getByRole("heading", { name: "Pidgeot is sorting what it has already found." })).toBeInTheDocument();
    expect(screen.getByText("Pidgeot is still looking. But it has already found sender groups you can start reviewing now.")).toBeInTheDocument();
    expect(screen.getByText("18 messages discovered")).toBeInTheDocument();
    expect(screen.getByText("2 sender groups found")).toBeInTheDocument();
    expect(screen.getByText("1 group worth a look")).toBeInTheDocument();
    expect(screen.getAllByText("store@example.com").length).toBeGreaterThan(0);
    expect(screen.getAllByText("updates@mailer.test").length).toBeGreaterThan(0);
  });
});