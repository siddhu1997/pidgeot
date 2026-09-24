import { describe, expect, it } from "vitest";

import { DEV_LAB_CATEGORY_PROFILES, DEV_LAB_UNSUBSCRIBE_PROFILES } from "@/lib/dev-lab/constants";
import { createDevLabDataset, normalizeGenerationRequest } from "@/lib/dev-lab/generator";

const BASE_INPUT = {
  categoryProfile: DEV_LAB_CATEGORY_PROFILES.PROMOTIONAL,
  fromDomain: "pidgeot-dev.siddharths.co.in",
  messagesPerSender: 4,
  recipient: "inbox@example.test",
  seed: 17,
  senderCount: 3,
  unreadRatio: 0.75,
  unsubscribeBaseUrl: "https://timmy-sclerenchymatous-unfanatically.ngrok-free.dev",
  unsubscribeProfile: DEV_LAB_UNSUBSCRIBE_PROFILES.RFC8058_ONE_CLICK,
};

describe("dev-lab generator", () => {
  it("is deterministic for the same seed and configuration", () => {
    const first = createDevLabDataset(BASE_INPUT);
    const second = createDevLabDataset(BASE_INPUT);

    expect(second).toEqual(first);
    expect(first.messages).toHaveLength(12);
    expect(first.senders).toHaveLength(3);
    expect(first.senders.map((sender) => sender.primaryAddress)).toEqual([
      "pixel@pidgeot-dev.siddharths.co.in",
      "mint@pidgeot-dev.siddharths.co.in",
      "north@pidgeot-dev.siddharths.co.in",
    ]);
  });

  it("puts RFC8058 metadata on the public development unsubscribe origin", () => {
    const dataset = createDevLabDataset(BASE_INPUT);
    const message = dataset.messages[0];

    expect(message.listUnsubscribe).toMatch(/^<https:\/\/timmy-sclerenchymatous-unfanatically\.ngrok-free\.dev\/api\/dev-lab\/unsubscribe\?token=/);
    expect(message.listUnsubscribePost).toBe("List-Unsubscribe=One-Click");
    expect(message.messageId).toMatch(/^<pidgeot-dev-devmail_17_0_0@pidgeot-dev\.siddharths\.co\.in>$/);
    expect(message.fromAddress).toBe("pixel@pidgeot-dev.siddharths.co.in");
    expect(JSON.stringify(dataset)).not.toMatch(/localhost|127\.0\.0\.1|gmail\.com|mailchimp|sendgrid/i);
  });

  it("omits one-click semantics for HTTPS manual and localhost unsubscribe bases", () => {
    const manual = createDevLabDataset({
      ...BASE_INPUT,
      unsubscribeProfile: DEV_LAB_UNSUBSCRIBE_PROFILES.HTTPS_MANUAL,
    });

    expect(manual.messages[0].listUnsubscribe).toContain("https://timmy-sclerenchymatous-unfanatically.ngrok-free.dev/api/dev-lab/unsubscribe");
    expect(manual.messages[0].listUnsubscribePost).toBeNull();

    expect(() => createDevLabDataset({
      ...BASE_INPUT,
      unsubscribeBaseUrl: "http://localhost:3000",
    })).toThrow(/localhost/);
  });

  it("rejects requests that exceed development hard limits", () => {
    expect(() => normalizeGenerationRequest({
      messagesPerSender: 10,
      senderCount: 10,
    })).toThrow(/50 messages total/);

    expect(() => normalizeGenerationRequest({
      messagesPerSender: 11,
      senderCount: 2,
    })).toThrow(/hard limits|at most/);
  });
});
