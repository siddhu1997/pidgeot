import { describe, expect, it } from "vitest";

import {
  createPlaygroundDataset,
  DEFAULT_PLAYGROUND_CONTROLS,
} from "@/lib/playground/synthetic-data";

describe("playground synthetic data", () => {
  it("is deterministic for the same controls", () => {
    const first = createPlaygroundDataset(DEFAULT_PLAYGROUND_CONTROLS);
    const second = createPlaygroundDataset(DEFAULT_PLAYGROUND_CONTROLS);

    expect(second).toEqual(first);
  });

  it("responds structurally when the synthetic dataset changes", () => {
    const baseline = createPlaygroundDataset(DEFAULT_PLAYGROUND_CONTROLS);
    const changed = createPlaygroundDataset({
      ...DEFAULT_PLAYGROUND_CONTROLS,
      messages: 7200,
      seed: 29,
      senders: 92,
      unsubscribeAvailable: 34,
    });

    expect(changed.summary.messages).toBe(7200);
    expect(changed.summary.senders).toBe(92);
    expect(changed.summary.unsubscribeAvailable).toBe(34);
    expect(changed.featuredGroups).not.toEqual(baseline.featuredGroups);
    expect(changed.visibleMessages.length).toBeGreaterThan(0);
    expect(changed.whyGroup.reasoningSignals).toEqual(expect.objectContaining({
      listId: expect.any(Boolean),
      listUnsubscribe: expect.any(Boolean),
      precedenceBulk: expect.any(Boolean),
    }));
  });
});