import { createElement } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

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

  afterEach(() => {
    vi.unstubAllGlobals();
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

    const sortLabel = screen.getByText("Sort by");
    const filterLabel = screen.getByText("Filter by category");
    const selectAll = screen.getByRole("button", { name: "Select all" });
    const clearAll = screen.getByRole("button", { name: "Clear all" });

    expect(sortLabel.compareDocumentPosition(filterLabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(filterLabel.compareDocumentPosition(selectAll) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(selectAll.compareDocumentPosition(clearAll) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

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

    expect(screen.getByText("Manual action required")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Run simulated unsubscribe/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "View instructions" }));

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

  it("keeps delete unread available for manual-only senders and leaves unsubscribe unexecutable", () => {
    render(createElement(ProductionScanScreen, {
      authConfigured: true,
      autoAdvance: false,
      email: "user@example.com",
      gmailAuthState: "GMAIL_READY",
      initialScan: {
        senderGroups: [
          {
            attention: "MEDIUM",
            category: "NEWSLETTER",
            id: "group-manual-unread",
            messageCount: 5,
            representativeAddress: "manual-unread@example.com",
            representativeDomain: "example.com",
            senderDomains: ["example.com"],
            unreadCount: 3,
            unsubscribe: {
              mechanisms: [{ id: "manual-mechanism", manualActionRequired: true, status: "MANUAL_ACTION_REQUIRED", type: "MAILTO" }],
              resolutionStatus: "MANUAL_ACTION_REQUIRED",
            },
            workflow: {
              cleanupEligibleCount: 3,
              cleanupExecution: { execution: null, state: "NOT_STARTED" },
              manualUnsubscribeOperations: [{ id: "manual-mailto", mailto: { recipient: "leave@example.com", subject: "unsubscribe" }, status: "MANUAL_ACTION_REQUIRED", type: "MAILTO" }],
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

    fireEvent.click(screen.getByRole("button", { name: /manual-unread@example.com/i }));

    expect(screen.getByText("Manual action required")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Delete unread/i })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /Run simulated unsubscribe/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View instructions" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: /^Delete unread/i }));

    expect(screen.getByRole("button", { name: /Run simulated delete unread/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Run simulated unsubscribe/i })).not.toBeInTheDocument();
  });

  it("keeps unsubscribe unavailable when the selection has no unsubscribe path", () => {
    render(createElement(ProductionScanScreen, {
      authConfigured: true,
      autoAdvance: false,
      email: "user@example.com",
      gmailAuthState: "GMAIL_READY",
      initialScan: {
        senderGroups: [
          {
            attention: "LOW",
            category: "NOTIFICATION",
            id: "group-cleanup-only",
            messageCount: 4,
            representativeAddress: "alerts@notify.example",
            representativeDomain: "notify.example",
            senderDomains: ["notify.example"],
            unreadCount: 2,
            unsubscribe: {
              mechanisms: [],
              resolutionStatus: "UNAVAILABLE",
            },
            workflow: {
              cleanupEligibleCount: 2,
              cleanupExecution: { execution: null, state: "NOT_STARTED" },
              manualUnsubscribeOperations: [],
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

    fireEvent.click(screen.getByRole("button", { name: /alerts@notify.example/i }));

    expect(screen.getByRole("button", { name: /^Unsubscribe/i })).toBeDisabled();
    expect(screen.getAllByText("Unavailable for this selection.").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /manual$/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Delete unread/i })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /Run simulated unsubscribe/i })).not.toBeInTheDocument();
  });

  it("does not expose unsafe raw targets or change selection when opening manual details", async () => {
    render(createElement(ProductionScanScreen, {
      authConfigured: true,
      autoAdvance: false,
      email: "user@example.com",
      gmailAuthState: "GMAIL_READY",
      initialScan: {
        senderGroups: [
          {
            attention: "LOW",
            category: "UPDATES",
            id: "group-http-manual",
            messageCount: 2,
            representativeAddress: "http-manual@example.com",
            representativeDomain: "example.com",
            senderDomains: ["example.com"],
            unreadCount: 0,
            unsubscribe: {
              mechanisms: [{ id: "http-mechanism", manualActionRequired: true, status: "MANUAL_ACTION_REQUIRED", type: "HTTP_LINK" }],
              resolutionStatus: "MANUAL_ACTION_REQUIRED",
            },
            workflow: {
              cleanupEligibleCount: 0,
              cleanupExecution: { execution: null, state: "NOT_STARTED" },
              manualUnsubscribeOperations: [{ host: "example.com", id: "http-op", path: "/leave", status: "MANUAL_ACTION_REQUIRED", target: "http://example.com/leave", type: "HTTP_LINK" }],
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

    fireEvent.click(screen.getByRole("button", { name: /http-manual@example.com/i }));

    expect(screen.getByRole("heading", { name: "1 sender selected" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "View instructions" }));

    expect(screen.getByRole("dialog", { name: "Manual unsubscribe details" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "1 sender selected" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open unsubscribe page" })).not.toBeInTheDocument();
    expect(screen.queryByText("http://example.com/leave")).not.toBeInTheDocument();
    expect(screen.getByText("example.com/leave")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Run simulated unsubscribe/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Manual unsubscribe details" })).not.toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { name: "1 sender selected" })).toBeInTheDocument();
    expect(screen.getByText("Manual action required")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Run simulated unsubscribe/i })).not.toBeInTheDocument();
  });

  it("executes only automatic-capable senders from a mixed selection and keeps the manual sender active", async () => {
    let latestWorkflow = null;
    const fetchMock = vi.fn(async (url) => {
      if (url === "/api/workflow/status") {
        return {
          json: async () => ({ workflow: latestWorkflow }),
          ok: true,
        };
      }

      if (url === "/api/workflow/execute") {
        latestWorkflow = {
          scan: {
                scanId: "scan-mixed",
                senderGroups: [
                  {
                    attention: "HIGH",
                    category: "PROMOTIONAL",
                    id: "group-auto",
                    messageCount: 4,
                    representativeAddress: "auto@example.com",
                    representativeDomain: "example.com",
                    senderDomains: ["example.com"],
                    unreadCount: 0,
                    unsubscribe: {
                      mechanisms: [{ automatic: true, id: "auto-mechanism", status: "AUTOMATIC", type: "RFC8058_ONE_CLICK" }],
                      resolutionStatus: "AUTOMATIC",
                    },
                    workflow: {
                      cleanupEligibleCount: 0,
                      cleanupExecution: { execution: null, state: "NOT_STARTED" },
                      manualUnsubscribeOperations: [],
                      unsubscribeAutomaticOperationCount: 0,
                      unsubscribeExecution: {
                        execution: { summary: { successfulCount: 1 } },
                        state: "COMPLETED",
                      },
                      unsubscribeHandledLocally: true,
                      unsubscribeOperationsAvailable: false,
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
        };

        return {
          json: async () => ({ workflow: latestWorkflow }),
          ok: true,
        };
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    render(createElement(ProductionScanScreen, {
      authConfigured: true,
      autoAdvance: false,
      email: "user@example.com",
      gmailAuthState: "GMAIL_READY",
      initialScan: {
        scanId: "scan-mixed",
        senderGroups: [
          {
            attention: "HIGH",
            category: "PROMOTIONAL",
            id: "group-auto",
            messageCount: 4,
            representativeAddress: "auto@example.com",
            representativeDomain: "example.com",
            senderDomains: ["example.com"],
            unreadCount: 0,
            unsubscribe: {
              mechanisms: [{ automatic: true, id: "auto-mechanism", status: "AUTOMATIC", type: "RFC8058_ONE_CLICK" }],
              resolutionStatus: "AUTOMATIC",
            },
            workflow: {
              cleanupEligibleCount: 0,
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
    fireEvent.click(screen.getByRole("button", { name: /^Unsubscribe/i }));
    fireEvent.click(screen.getByRole("button", { name: /Run simulated unsubscribe/i }));

    await waitFor(() => {
      const executeCall = fetchMock.mock.calls.find(([url]) => url === "/api/workflow/execute");
      expect(executeCall).toBeTruthy();
      expect(JSON.parse(executeCall[1].body)).toEqual({
        selections: [{
          actions: {
            cleanup: false,
            unsubscribe: true,
          },
          senderGroupId: "group-auto",
        }],
      });
      expect(screen.getByRole("tab", { name: "Active 1" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Done 1" })).toBeInTheDocument();
    });

    expect(screen.getAllByText("manual@example.com").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "1 sender selected" })).toBeInTheDocument();
    expect(screen.getByText("Manual action required")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Run simulated unsubscribe/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Done 1" }));

    expect(screen.getAllByText("auto@example.com").length).toBeGreaterThan(0);
    expect(screen.getByText("Unsubscribed")).toBeInTheDocument();
  });
});