import { describe, expect, it } from "vitest";

import {
  getSenderGroupingStateShape,
  ingestMessagesIntoSenderGroups,
  listSanitizedSenderGroups,
} from "@/lib/grouping/sender-grouper";
import { SCAN_SOURCES } from "@/lib/scanning/constants";

function createMessage(id, {
  from = null,
  labelIds = [],
  listId = null,
  listUnsubscribe = null,
  sender = null,
  source = SCAN_SOURCES.ACTIVE_MAIL,
} = {}) {
  return {
    headers: {
      from,
      listId,
      listUnsubscribe,
      sender,
    },
    id,
    labelIds,
    source,
  };
}

function groupMessages(messages, existingState = null) {
  return ingestMessagesIntoSenderGroups(existingState || getSenderGroupingStateShape(), messages);
}

function sanitize(messages, existingState = null) {
  return listSanitizedSenderGroups(groupMessages(messages, existingState));
}

describe("sender grouper", () => {
  it("groups exact same sender addresses together", () => {
    const groups = sanitize([
      createMessage("m-1", { from: "Alerts <alerts@example.com>" }),
      createMessage("m-2", { from: "alerts@example.com" }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toEqual(expect.objectContaining({
      messageCount: 2,
      representativeAddress: "alerts@example.com",
      senderDomains: ["example.com"],
    }));
  });

  it("canonicalizes different address casing without provider-specific rewriting", () => {
    const groups = sanitize([
      createMessage("m-1", { from: "News+daily@Example.com" }),
      createMessage("m-2", { from: "news+daily@example.COM" }),
      createMessage("m-3", { from: "news@example.com" }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups.find((group) => group.representativeAddress === "news+daily@example.com")).toEqual(
      expect.objectContaining({ messageCount: 2 }),
    );
    expect(groups.find((group) => group.representativeAddress === "news@example.com")).toEqual(
      expect.objectContaining({ messageCount: 1 }),
    );
  });

  it("keeps different addresses on the same domain separate without stronger evidence", () => {
    const groups = sanitize([
      createMessage("m-1", { from: "alice@example.com" }),
      createMessage("m-2", { from: "bob@example.com" }),
    ]);

    expect(groups).toHaveLength(2);
  });

  it("does not merge solely on display name", () => {
    const groups = sanitize([
      createMessage("m-1", { from: '"GitHub" <notifications@github.com>' }),
      createMessage("m-2", { from: '"GitHub" <security@github.com>' }),
    ]);

    expect(groups).toHaveLength(2);
  });

  it("uses shared List-ID as strong grouping evidence", () => {
    const groups = sanitize([
      createMessage("m-1", {
        from: '"Confluent" <news@confluent.io>',
        listId: "Confluent Product Updates <updates.confluent.example>",
      }),
      createMessage("m-2", {
        from: '"Confluent Cloud" <updates@confluent.cloud>',
        listId: "updates.confluent.example",
      }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toEqual(expect.objectContaining({
      messageCount: 2,
      senderDomains: ["confluent.cloud", "confluent.io"],
    }));
    expect(groups[0].groupingSignals).toContainEqual({
      type: "LIST_ID_MATCH",
      value: "updates.confluent.example",
    });
  });

  it("does not merge different List-ID values solely because the domain matches", () => {
    const groups = sanitize([
      createMessage("m-1", {
        from: "news@example.com",
        listId: "one.example.com",
      }),
      createMessage("m-2", {
        from: "updates@example.com",
        listId: "two.example.com",
      }),
    ]);

    expect(groups).toHaveLength(2);
  });

  it("separates unsubscribe service domains from sender domains", () => {
    const groups = sanitize([
      createMessage("m-1", {
        from: '"Confluent" <newsletter@updates.example.com>',
        listId: "updates.example.list",
        listUnsubscribe: "<https://u123.sendgrid.net/unsub>, <mailto:leave@sendgrid.net>",
      }),
    ]);

    expect(groups[0]).toEqual(expect.objectContaining({
      senderDomains: ["updates.example.com"],
      unsubscribe: {
        mechanisms: [
          expect.objectContaining({
            status: "MANUAL_ACTION_REQUIRED",
            type: "HTTPS_LINK",
          }),
          expect.objectContaining({
            status: "MANUAL_ACTION_REQUIRED",
            type: "MAILTO",
          }),
        ],
        resolutionStatus: "MANUAL_ACTION_REQUIRED",
      },
      unsubscribeServiceDomains: ["sendgrid.net", "u123.sendgrid.net"],
    }));
  });

  it("aggregates active, trash, and unread counts on the same sender group", () => {
    const groups = sanitize([
      createMessage("m-1", { from: "news@example.com", labelIds: ["UNREAD"] }),
      createMessage("m-2", { from: "news@example.com", source: SCAN_SOURCES.TRASH }),
    ]);

    expect(groups[0]).toEqual(expect.objectContaining({
      activeCount: 1,
      messageCount: 2,
      trashCount: 1,
      unreadCount: 1,
      sourceCounts: {
        ACTIVE_MAIL: 1,
        TRASH: 1,
      },
    }));
  });

  it("supports multiple sender addresses in one group through shared strong evidence", () => {
    const groups = sanitize([
      createMessage("m-1", {
        from: "news@example.com",
        listId: "updates.example.com",
      }),
      createMessage("m-2", {
        from: "updates@example.com",
        listId: "updates.example.com",
      }),
    ]);

    expect(groups[0].addresses).toEqual([
      expect.objectContaining({ canonicalAddress: "news@example.com" }),
      expect.objectContaining({ canonicalAddress: "updates@example.com" }),
    ]);
  });

  it("updates existing groups incrementally and ignores duplicate message ids", () => {
    const stateAfterChunkOne = groupMessages([
      createMessage("m-1", {
        from: "news@example.com",
        listId: "updates.example.com",
      }),
    ]);
    const stateAfterChunkTwo = groupMessages([
      createMessage("m-1", {
        from: "news@example.com",
        listId: "updates.example.com",
      }),
      createMessage("m-2", {
        from: "updates@example.com",
        listId: "updates.example.com",
      }),
    ], stateAfterChunkOne);

    expect(listSanitizedSenderGroups(stateAfterChunkTwo)).toEqual([
      expect.objectContaining({
        messageCount: 2,
      }),
    ]);
  });

  it("produces the same grouping regardless of chunk boundaries and message order", () => {
    const messages = [
      createMessage("m-1", { from: "news@example.com", listId: "updates.example.com" }),
      createMessage("m-2", { from: "alerts@example.com" }),
      createMessage("m-3", { from: "updates@example.com", listId: "updates.example.com" }),
    ];
    const singlePass = sanitize(messages);
    const chunkedState = groupMessages(messages.slice(0, 2));
    const chunked = listSanitizedSenderGroups(groupMessages([messages[2]], chunkedState));
    const reversed = sanitize([...messages].reverse());

    expect(chunked).toEqual(singlePass);
    expect(reversed).toEqual(singlePass);
  });

  it("handles malformed or missing sender data conservatively", () => {
    const groups = sanitize([
      createMessage("m-1", { from: "Not an email header" }),
      createMessage("m-2", { from: "Not an email header" }),
      createMessage("m-3", { sender: "fallback@example.com" }),
      createMessage("m-4", {}),
    ]);

    expect(groups).toHaveLength(3);
    expect(groups.find((group) => group.representativeAddress === "fallback@example.com")).toEqual(
      expect.objectContaining({
        groupingSignals: expect.arrayContaining([{ type: "SENDER_HEADER_FALLBACK" }]),
        unsubscribe: {
          mechanisms: [],
          resolutionStatus: "UNAVAILABLE",
        },
      }),
    );
    expect(groups.find((group) => group.representativeAddress === null)).toEqual(
      expect.objectContaining({
        messageCount: 2,
        unsubscribe: {
          mechanisms: [],
          resolutionStatus: "UNAVAILABLE",
        },
      }),
    );
  });

  it("ignores malformed List-ID values as authoritative grouping evidence", () => {
    const groups = sanitize([
      createMessage("m-1", { from: "news@example.com", listId: "bad list id" }),
      createMessage("m-2", { from: "updates@example.com", listId: "bad list id" }),
    ]);

    expect(groups).toHaveLength(2);
  });

  it("preserves explainable signals without fuzzy matching", () => {
    const groups = sanitize([
      createMessage("m-1", {
        from: '"Mailchimp Weekly" <weekly@brand.example>',
        listId: "brand-weekly.example",
        listUnsubscribe: "<mailto:leave@mailchimp.com>, <https://click.mailchimp.com/u/123>",
      }),
      createMessage("m-2", {
        from: '"Mailchimp Weekly" <offers@otherbrand.example>',
      }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0].groupingSignals).toEqual(
      expect.arrayContaining([
        { type: "EXACT_ADDRESS_MATCH", value: "weekly@brand.example" },
        { type: "LIST_ID_MATCH", value: "brand-weekly.example" },
        { type: "UNSUBSCRIBE_SERVICE_DOMAIN_OBSERVED", value: "click.mailchimp.com" },
        { type: "UNSUBSCRIBE_SERVICE_DOMAIN_OBSERVED", value: "mailchimp.com" },
      ]),
    );
  });

  it("maintains cross-state isolation and handles a large synthetic dataset", () => {
    const oneState = groupMessages(
      Array.from({ length: 1000 }, (_, index) => createMessage(`acct-a-${index}`, {
        from: `news+${index % 20}@example.com`,
        listId: `stream-${index % 10}.example.com`,
      })),
    );
    const twoState = groupMessages([
      createMessage("acct-b-1", { from: "alerts@other.example" }),
    ]);

    const firstGroups = listSanitizedSenderGroups(oneState);
    const secondGroups = listSanitizedSenderGroups(twoState);

    expect(firstGroups.length).toBeLessThanOrEqual(20);
    expect(secondGroups).toEqual([
      expect.objectContaining({ representativeAddress: "alerts@other.example" }),
    ]);
  });
});