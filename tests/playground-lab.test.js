import { createElement } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { PlaygroundLab } from "@/components/playground/playground-lab";

vi.mock("next/dynamic", () => ({
  default: () => function DynamicStub() {
    return createElement("div", { "data-testid": "dynamic-stub" });
  },
}));

describe("playground lab", () => {
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

  it("defaults to a stage-first experience without raw data panels", () => {
    render(createElement(PlaygroundLab));

    expect(screen.getByText("Strange little machines.")).toBeInTheDocument();
    expect(screen.getByText("Watch Pidgeot discover who belongs together.")).toBeInTheDocument();
    expect(screen.getByText("Messages discovered")).toBeInTheDocument();
    expect(screen.getByText("Scan")).toBeInTheDocument();
    expect(screen.getByText("Decision")).toBeInTheDocument();
    expect(screen.getByText("Cleanup")).toBeInTheDocument();
    expect(screen.getByText("Reference")).toBeInTheDocument();
    expect(screen.getByText("Cards")).toBeInTheDocument();
    expect(screen.getByText("Clusters")).toBeInTheDocument();
    expect(screen.getByText("Developer inspector")).toBeInTheDocument();
    expect(screen.queryByText("Synthetic Data")).not.toBeInTheDocument();
    expect(screen.queryByText("Human Judgement Prompts")).not.toBeInTheDocument();
  });

  it("renders the cleanup ritual studies and clears unread counts in reduced motion", async () => {
    render(createElement(PlaygroundLab));

    fireEvent.click(screen.getByRole("button", { name: /cleanup/i }));
    expect(await screen.findByText("Watch clutter clear from the inbox surface.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /broom/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /trash can/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /shredder/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^unsubscribe$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /process selected/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /reduced motion off/i }));
    fireEvent.click(screen.getByRole("button", { name: /process selected/i }));

    expect(screen.getByText("Clear space")).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.textContent === "Unread remaining0")).toBeInTheDocument();
  });

  it("renders the animation reference lab and completes a study in reduced motion", async () => {
    render(createElement(PlaygroundLab));

    fireEvent.click(screen.getByRole("button", { name: /reference/i }));
    expect(await screen.findByText("Study how Pidgeot objects should move.")).toBeInTheDocument();
    expect(screen.getByText("Gather")).toBeInTheDocument();
    expect(screen.getByText("Sweep")).toBeInTheDocument();
    expect(screen.getByText("Deposit")).toBeInTheDocument();
    expect(screen.getByText("Feed")).toBeInTheDocument();
    expect(screen.getByText("Sever")).toBeInTheDocument();
    expect(screen.getByText("Settle")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /reduced motion off/i }));
    fireEvent.click(screen.getByRole("button", { name: /^play gather study$/i }));

    expect(screen.getByRole("button", { name: /^complete gather study$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^replay gather study$/i })).toBeInTheDocument();
  });

  it("lets a reference study complete in motion mode after play", async () => {
    render(createElement(PlaygroundLab));

    fireEvent.click(screen.getByRole("button", { name: /reference/i }));
    expect(await screen.findByText("Study how Pidgeot objects should move.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^play gather study$/i }));
    expect(screen.getByRole("button", { name: /^pause gather study$/i })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /^complete gather study$/i }, { timeout: 2000 })).toBeInTheDocument();
  });

  it("renders the scan ritual and can pause cleanly", async () => {
    render(createElement(PlaygroundLab));

    fireEvent.click(screen.getByRole("button", { name: /scan/i }));
    expect(await screen.findByText("Watch Pidgeot work through your inbox.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /pause scan/i })).toBeInTheDocument();
    expect(screen.getByText("Discovered structure")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /pause scan/i }));
    expect(screen.getByRole("button", { name: /resume scan/i })).toBeInTheDocument();
    expect(screen.getByText("Paused")).toBeInTheDocument();
  });

  it("keeps machine destinations bounded when more groups are discovered", async () => {
    render(createElement(PlaygroundLab));

    fireEvent.click(screen.getByRole("button", { name: /reduced motion off/i }));
    expect(await screen.findByText(/\+\s+\d+\s+more/i)).toBeInTheDocument();
    expect(screen.getByText("Visible groups")).toBeInTheDocument();
  });

  it("renders the decision surface and grows an action tray from selection", async () => {
    render(createElement(PlaygroundLab));

    fireEvent.click(screen.getByRole("button", { name: /decision/i }));
    expect(await screen.findByText("See which senders deserve action.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /select all visible/i }));
    expect(await screen.findByText(/senders selected/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /unsubscribe/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /move .* to trash/i })).toBeInTheDocument();
  });

  it("keeps the cards and clusters comparison experiments available", async () => {
    render(createElement(PlaygroundLab));

    fireEvent.click(screen.getByRole("button", { name: /cards/i }));
    expect(await screen.findByText("Watch inbox piles reorganise.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /clusters/i }));
    expect(await screen.findByText("Watch chaos become structure.")).toBeInTheDocument();
  });
});