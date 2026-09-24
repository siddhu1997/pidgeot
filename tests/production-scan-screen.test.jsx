import { createElement } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("bulk selects only visible actionable active sender groups and clears them", async () => {
    render(createElement(ProductionScanScreen, {
      authConfigured: true,
      autoAdvance: false,
      email: "user@example.com",
      gmailAuthState: "GMAIL_READY",
      initialScan: {
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
            unsubscribe: {
              mechanisms: [{ id: "mechanism-1", status: "ONE_CLICK_READY" }],
              resolutionStatus: "ONE_CLICK_READY",
            },
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
            unsubscribe: { mechanisms: [], resolutionStatus: "UNAVAILABLE" },
          },
          {
            attention: "LOW",
            category: "SOCIAL",
            id: "group-3",
            messageCount: 3,
            representativeAddress: "alerts@social.example",
            representativeDomain: "social.example",
            senderDomains: ["social.example"],
            unreadCount: 0,
            unsubscribe: { mechanisms: [], resolutionStatus: "UNAVAILABLE" },
            workflow: {
              cleanupEligibleCount: 0,
              cleanupExecution: {
                execution: {
                  summary: { successfulCount: 2 },
                },
                state: "COMPLETED",
              },
              unsubscribeHandledLocally: true,
            },
          },
        ],
        state: "COMPLETE",
      },
      workflowExecutionMode: "SIMULATED",
    }));

    fireEvent.click(screen.getByRole("button", { name: "Select all" }));

    expect(screen.getByRole("heading", { name: "1 sender selected" })).toBeInTheDocument();
    expect(screen.getByText("What would you like Pidgeot to do with these senders?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear all" })).toBeEnabled();
    expect(screen.getByRole("tab", { name: /Done 1/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));

    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "1 sender selected" })).not.toBeInTheDocument();
    });
    expect(screen.getAllByText("0").length).toBeGreaterThan(0);
  });

  it("keeps manual-only unsubscribe informational and opens manual details", async () => {
    render(createElement(ProductionScanScreen, {
      authConfigured: true,
      autoAdvance: false,
      email: "user@example.com",
      gmailAuthState: "GMAIL_READY",
      initialScan: {
        senderGroups: [
          {
            attention: "LOW",
            category: "PROMOTIONAL",
            id: "group-manual",
            messageCount: 2,
            representativeAddress: "manual@example.com",
            representativeDomain: "example.com",
            senderDomains: ["example.com"],
            unreadCount: 0,
            unsubscribe: {
              mechanisms: [{ id: "manual-mechanism", manualActionRequired: true, status: "MANUAL_ACTION_REQUIRED", type: "HTTPS_LINK" }],
              resolutionStatus: "MANUAL_ACTION_REQUIRED",
            },
            workflow: {
              cleanupEligibleCount: 0,
              cleanupExecution: { execution: null, state: "NOT_STARTED" },
              manualUnsubscribeOperations: [{ host: "example.com", id: "manual-op", path: "/unsubscribe", status: "MANUAL_ACTION_REQUIRED", target: "https://example.com/unsubscribe", type: "HTTPS_LINK" }],
              unsubscribeAutomaticOperationCount: 0,
              unsubscribeExecution: { execution: null, state: "NOT_STARTED" },
              unsubscribeOperationsAvailable: false,
            },
          },
        ],
        state: "COMPLETE",
      },
      workflowExecutionMode: "SIMULATED",
    }));

    fireEvent.click(screen.getByRole("button", { name: /manual@example.com/i }));

    expect(screen.getByRole("button", { name: /^Unsubscribe/i })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Run simulated unsubscribe/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "1 sender manual" }));

    expect(screen.getByRole("dialog", { name: "Manual unsubscribe details" })).toBeInTheDocument();
    expect(screen.getAllByText("manual@example.com").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Open unsubscribe page" })).toHaveAttribute("href", "https://example.com/unsubscribe");

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Manual unsubscribe details" })).not.toBeInTheDocument();
    });
  });

  it("allows mixed selections to execute automatic unsubscribe while exposing manual details separately", () => {
    render(createElement(ProductionScanScreen, {
      authConfigured: true,
      autoAdvance: false,
      email: "user@example.com",
      gmailAuthState: "GMAIL_READY",
      initialScan: {
        senderGroups: [
          {
            attention: "HIGH",
            category: "PROMOTIONAL",
            id: "group-auto",
            messageCount: 4,
            representativeAddress: "auto@example.com",
            representativeDomain: "example.com",
            senderDomains: ["example.com"],
            unreadCount: 1,
            unsubscribe: {
              mechanisms: [{ automatic: true, id: "auto-mechanism", status: "AUTOMATIC", type: "RFC8058_ONE_CLICK" }],
              resolutionStatus: "AUTOMATIC",
            },
            workflow: {
              cleanupEligibleCount: 1,
              cleanupExecution: { execution: null, state: "NOT_STARTED" },
              manualUnsubscribeOperations: [],
              unsubscribeAutomaticOperationCount: 1,
              unsubscribeExecution: { execution: null, state: "NOT_STARTED" },
              unsubscribeOperationsAvailable: true,
            },
          },
          {
            attention: "LOW",
            category: "UPDATES",
            id: "group-manual",
            messageCount: 2,
            representativeAddress: "manual@example.com",
            representativeDomain: "manual.example.com",
            senderDomains: ["manual.example.com"],
            unreadCount: 0,
            unsubscribe: {
              mechanisms: [{ id: "manual-mechanism", manualActionRequired: true, status: "MANUAL_ACTION_REQUIRED", type: "MAILTO" }],
              resolutionStatus: "MANUAL_ACTION_REQUIRED",
            },
            workflow: {
              cleanupEligibleCount: 0,
              cleanupExecution: { execution: null, state: "NOT_STARTED" },
              manualUnsubscribeOperations: [{ id: "manual-mailto", mailto: { recipient: "manual@example.com", subject: "unsubscribe me" }, status: "MANUAL_ACTION_REQUIRED", type: "MAILTO" }],
              unsubscribeAutomaticOperationCount: 0,
              unsubscribeExecution: { execution: null, state: "NOT_STARTED" },
              unsubscribeOperationsAvailable: false,
            },
          },
        ],
        state: "COMPLETE",
      },
      workflowExecutionMode: "SIMULATED",
    }));

    fireEvent.click(screen.getByRole("button", { name: "Select all" }));

    expect(screen.getByRole("button", { name: /^Unsubscribe/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: "1 sender manual" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Run simulated unsubscribe/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Unsubscribe/i }));

    expect(screen.getByRole("button", { name: /Run simulated unsubscribe/i })).toBeInTheDocument();
  });
});