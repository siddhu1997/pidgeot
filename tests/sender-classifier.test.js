import { afterEach, describe, expect, it, vi } from "vitest";

import { classifySenderGroup } from "@/lib/classification/sender-classifier";
import {
  ATTENTION_LEVELS,
  SENDER_CATEGORIES,
} from "@/lib/classification/constants";
import {
  getSenderGroupingStateShape,
  ingestMessagesIntoSenderGroups,
  listSanitizedSenderGroups,
} from "@/lib/grouping/sender-grouper";
import { SCAN_SOURCES } from "@/lib/scanning/constants";

function createClassificationInput(overrides = {}) {
  return {
    activeCount: 0,
    addresses: [
      {
        canonicalAddress: "hello@example.com",
        originalAddress: "hello@example.com",
        originalAddresses: ["hello@example.com"],
      },
    ],
    displayNames: [],
    groupingSignals: [],
    messageCount: 1,
    metadataSignals: {
      listIdMessageCount: 0,
      listUnsubscribeMessageCount: 0,
      listUnsubscribePostMessageCount: 0,
      precedenceBulkMessageCount: 0,
      precedenceListMessageCount: 0,
      replyToMessageCount: 0,
      senderHeaderMessageCount: 0,
    },
    representativeAddress: "hello@example.com",
    representativeDomain: "example.com",
    senderDomains: ["example.com"],
    sourceCounts: {
      ACTIVE_MAIL: 1,
      TRASH: 0,
    },
    trashCount: 0,
    unreadCount: 0,
    unsubscribeServiceDomains: [],
    ...overrides,
  };
}

function createMessage(id, {
  from = null,
  labelIds = [],
  listId = null,
  listUnsubscribe = null,
  listUnsubscribePost = null,
  precedence = null,
  replyTo = null,
  sender = null,
  source = SCAN_SOURCES.ACTIVE_MAIL,
} = {}) {
  return {
    headers: {
      from,
      listId,
      listUnsubscribe,
      listUnsubscribePost,
      precedence,
      replyTo,
      sender,
    },
    id,
    labelIds,
    source,
  };
}

function groupAndSanitize(messages, existingState = null) {
  const state = ingestMessagesIntoSenderGroups(existingState || getSenderGroupingStateShape(), messages);
  return {
    groups: listSanitizedSenderGroups(state),
    state,
  };
}

describe("sender classifier", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("classifies promotional sender groups deterministically", () => {
    const result = classifySenderGroup(createClassificationInput({
      activeCount: 22,
      addresses: [{
        canonicalAddress: "offers@brand.example",
        originalAddress: "offers@brand.example",
        originalAddresses: ["offers@brand.example"],
      }],
      messageCount: 40,
      metadataSignals: {
        listIdMessageCount: 0,
        listUnsubscribeMessageCount: 40,
        listUnsubscribePostMessageCount: 20,
        precedenceBulkMessageCount: 30,
        precedenceListMessageCount: 0,
        replyToMessageCount: 0,
        senderHeaderMessageCount: 0,
      },
      representativeAddress: "offers@brand.example",
      senderDomains: ["brand.example"],
      trashCount: 18,
      unreadCount: 32,
      unsubscribeServiceDomains: ["mailchimp.com"],
    }));

    expect(result.category).toBe(SENDER_CATEGORIES.PROMOTIONAL);
    expect(result.attention).toBe(ATTENTION_LEVELS.HIGH);
    expect(result.classificationSignals).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "PROMOTIONAL_ADDRESS_PATTERN" }),
      expect.objectContaining({ type: "UNSUBSCRIBE_INFRASTRUCTURE_PRESENT" }),
    ]));
  });

  it("classifies newsletter sender groups", () => {
    const result = classifySenderGroup(createClassificationInput({
      activeCount: 11,
      addresses: [{
        canonicalAddress: "digest@updates.example",
        originalAddress: "digest@updates.example",
        originalAddresses: ["digest@updates.example"],
      }],
      displayNames: ["Weekly Digest"],
      messageCount: 12,
      metadataSignals: {
        listIdMessageCount: 12,
        listUnsubscribeMessageCount: 10,
        listUnsubscribePostMessageCount: 5,
        precedenceBulkMessageCount: 0,
        precedenceListMessageCount: 10,
        replyToMessageCount: 0,
        senderHeaderMessageCount: 0,
      },
      representativeAddress: "digest@updates.example",
      representativeDomain: "updates.example",
      senderDomains: ["updates.example"],
      trashCount: 1,
      unreadCount: 4,
    }));

    expect(result.category).toBe(SENDER_CATEGORIES.NEWSLETTER);
    expect(result.attention).toBe(ATTENTION_LEVELS.LOW);
  });

  it("classifies social sender groups", () => {
    const result = classifySenderGroup(createClassificationInput({
      activeCount: 16,
      addresses: [{
        canonicalAddress: "mentions@community.example",
        originalAddress: "mentions@community.example",
        originalAddresses: ["mentions@community.example"],
      }],
      messageCount: 18,
      metadataSignals: {
        listIdMessageCount: 0,
        listUnsubscribeMessageCount: 0,
        listUnsubscribePostMessageCount: 0,
        precedenceBulkMessageCount: 0,
        precedenceListMessageCount: 0,
        replyToMessageCount: 18,
        senderHeaderMessageCount: 0,
      },
      representativeAddress: "mentions@community.example",
      representativeDomain: "community.example",
      senderDomains: ["community.example"],
      trashCount: 2,
      unreadCount: 10,
    }));

    expect(result.category).toBe(SENDER_CATEGORIES.SOCIAL);
    expect(result.attention).toBe(ATTENTION_LEVELS.MEDIUM);
  });

  it("classifies notification sender groups", () => {
    const result = classifySenderGroup(createClassificationInput({
      activeCount: 14,
      addresses: [{
        canonicalAddress: "alerts@monitor.example",
        originalAddress: "alerts@monitor.example",
        originalAddresses: ["alerts@monitor.example"],
      }],
      messageCount: 15,
      metadataSignals: {
        listIdMessageCount: 0,
        listUnsubscribeMessageCount: 0,
        listUnsubscribePostMessageCount: 0,
        precedenceBulkMessageCount: 0,
        precedenceListMessageCount: 0,
        replyToMessageCount: 0,
        senderHeaderMessageCount: 15,
      },
      representativeAddress: "alerts@monitor.example",
      representativeDomain: "monitor.example",
      senderDomains: ["monitor.example"],
      trashCount: 1,
      unreadCount: 3,
    }));

    expect(result.category).toBe(SENDER_CATEGORIES.NOTIFICATION);
  });

  it("classifies transactional sender groups", () => {
    const result = classifySenderGroup(createClassificationInput({
      activeCount: 6,
      addresses: [{
        canonicalAddress: "receipts@billing.example",
        originalAddress: "receipts@billing.example",
        originalAddresses: ["receipts@billing.example"],
      }],
      messageCount: 6,
      representativeAddress: "receipts@billing.example",
      representativeDomain: "billing.example",
      senderDomains: ["billing.example"],
      unreadCount: 1,
    }));

    expect(result.category).toBe(SENDER_CATEGORIES.TRANSACTIONAL);
    expect(result.attention).toBe(ATTENTION_LEVELS.LOW);
  });

  it("classifies updates sender groups", () => {
    const result = classifySenderGroup(createClassificationInput({
      activeCount: 13,
      addresses: [{
        canonicalAddress: "updates@product.example",
        originalAddress: "updates@product.example",
        originalAddresses: ["updates@product.example"],
      }],
      messageCount: 14,
      representativeAddress: "updates@product.example",
      representativeDomain: "product.example",
      senderDomains: ["product.example"],
      trashCount: 1,
      unreadCount: 4,
    }));

    expect(result.category).toBe(SENDER_CATEGORIES.UPDATES);
  });

  it("returns UNKNOWN when evidence is insufficient", () => {
    const result = classifySenderGroup(createClassificationInput({
      activeCount: 4,
      messageCount: 4,
      unreadCount: 0,
    }));

    expect(result.category).toBe(SENDER_CATEGORIES.UNKNOWN);
    expect(result.classificationSignals).toEqual([
      expect.objectContaining({ type: "INSUFFICIENT_CLASSIFICATION_EVIDENCE" }),
    ]);
  });

  it("returns UNKNOWN for ambiguous conflicting evidence", () => {
    const result = classifySenderGroup(createClassificationInput({
      activeCount: 16,
      addresses: [{
        canonicalAddress: "offers@brand.example",
        originalAddress: "offers@brand.example",
        originalAddresses: ["offers@brand.example"],
      }],
      messageCount: 20,
      metadataSignals: {
        listIdMessageCount: 18,
        listUnsubscribeMessageCount: 20,
        listUnsubscribePostMessageCount: 10,
        precedenceBulkMessageCount: 18,
        precedenceListMessageCount: 0,
        replyToMessageCount: 0,
        senderHeaderMessageCount: 0,
      },
      representativeAddress: "offers@brand.example",
      representativeDomain: "brand.example",
      senderDomains: ["brand.example"],
      trashCount: 4,
      unreadCount: 16,
      unsubscribeServiceDomains: ["mailservice.example"],
    }));

    expect(result.category).toBe(SENDER_CATEGORIES.UNKNOWN);
    expect(result.classificationSignals).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "AMBIGUOUS_CATEGORY_EVIDENCE" }),
    ]));
  });

  it("applies explicit precedence when deterministic ties are not ambiguous", () => {
    const result = classifySenderGroup(createClassificationInput({
      addresses: [{
        canonicalAddress: "alerts@status.example",
        originalAddress: "alerts@status.example",
        originalAddresses: ["alerts@status.example"],
      }],
      messageCount: 1,
      metadataSignals: {
        listIdMessageCount: 0,
        listUnsubscribeMessageCount: 0,
        listUnsubscribePostMessageCount: 0,
        precedenceBulkMessageCount: 0,
        precedenceListMessageCount: 0,
        replyToMessageCount: 0,
        senderHeaderMessageCount: 1,
      },
      representativeAddress: "alerts@status.example",
      representativeDomain: "status.example",
      senderDomains: ["status.example"],
    }));

    expect(result.category).toBe(SENDER_CATEGORIES.NOTIFICATION);
  });

  it("derives HIGH attention from low-engagement high-volume behavior", () => {
    const result = classifySenderGroup(createClassificationInput({
      messageCount: 30,
      trashCount: 16,
      unreadCount: 25,
    }));

    expect(result.attention).toBe(ATTENTION_LEVELS.HIGH);
    expect(result.attentionSignals).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "HIGH_UNREAD_RATIO" }),
      expect.objectContaining({ type: "HIGH_MESSAGE_VOLUME" }),
    ]));
  });

  it("derives MEDIUM attention independently from category", () => {
    const result = classifySenderGroup(createClassificationInput({
      activeCount: 16,
      addresses: [{
        canonicalAddress: "receipts@billing.example",
        originalAddress: "receipts@billing.example",
        originalAddresses: ["receipts@billing.example"],
      }],
      messageCount: 18,
      representativeAddress: "receipts@billing.example",
      representativeDomain: "billing.example",
      senderDomains: ["billing.example"],
      unreadCount: 10,
    }));

    expect(result.category).toBe(SENDER_CATEGORIES.TRANSACTIONAL);
    expect(result.attention).toBe(ATTENTION_LEVELS.MEDIUM);
  });

  it("keeps LOW attention when volume and engagement signals stay low", () => {
    const result = classifySenderGroup(createClassificationInput({
      activeCount: 6,
      addresses: [{
        canonicalAddress: "digest@updates.example",
        originalAddress: "digest@updates.example",
        originalAddresses: ["digest@updates.example"],
      }],
      messageCount: 6,
      metadataSignals: {
        listIdMessageCount: 6,
        listUnsubscribeMessageCount: 5,
        listUnsubscribePostMessageCount: 0,
        precedenceBulkMessageCount: 0,
        precedenceListMessageCount: 6,
        replyToMessageCount: 0,
        senderHeaderMessageCount: 0,
      },
      representativeAddress: "digest@updates.example",
      representativeDomain: "updates.example",
      senderDomains: ["updates.example"],
      unreadCount: 1,
    }));

    expect(result.category).toBe(SENDER_CATEGORIES.NEWSLETTER);
    expect(result.attention).toBe(ATTENTION_LEVELS.LOW);
  });

  it("does not treat List-Unsubscribe alone as promotional", () => {
    const result = classifySenderGroup(createClassificationInput({
      metadataSignals: {
        listIdMessageCount: 0,
        listUnsubscribeMessageCount: 1,
        listUnsubscribePostMessageCount: 0,
        precedenceBulkMessageCount: 0,
        precedenceListMessageCount: 0,
        replyToMessageCount: 0,
        senderHeaderMessageCount: 0,
      },
      unsubscribeServiceDomains: ["sendgrid.net"],
    }));

    expect(result.category).toBe(SENDER_CATEGORIES.UNKNOWN);
  });

  it("does not treat List-ID alone as newsletter", () => {
    const result = classifySenderGroup(createClassificationInput({
      metadataSignals: {
        listIdMessageCount: 1,
        listUnsubscribeMessageCount: 0,
        listUnsubscribePostMessageCount: 0,
        precedenceBulkMessageCount: 0,
        precedenceListMessageCount: 0,
        replyToMessageCount: 0,
        senderHeaderMessageCount: 0,
      },
    }));

    expect(result.category).toBe(SENDER_CATEGORIES.UNKNOWN);
  });

  it("does not let high volume alone determine category", () => {
    const result = classifySenderGroup(createClassificationInput({
      activeCount: 40,
      messageCount: 40,
      unreadCount: 5,
    }));

    expect(result.category).toBe(SENDER_CATEGORIES.UNKNOWN);
  });

  it("does not let high unread ratio alone determine category", () => {
    const result = classifySenderGroup(createClassificationInput({
      activeCount: 12,
      messageCount: 12,
      unreadCount: 11,
    }));

    expect(result.category).toBe(SENDER_CATEGORIES.UNKNOWN);
    expect(result.attention).toBe(ATTENTION_LEVELS.HIGH);
  });

  it("recomputes classification incrementally from the latest sender-group aggregate", () => {
    const firstChunk = groupAndSanitize([
      createMessage("m-1", {
        from: '"Weekly Digest" <digest@updates.example>',
        listId: "digest.updates.example",
      }),
    ]);

    expect(firstChunk.groups[0].category).toBe(SENDER_CATEGORIES.UNKNOWN);

    const secondChunk = groupAndSanitize([
      createMessage("m-2", {
        from: '"Weekly Digest" <digest@updates.example>',
        listId: "digest.updates.example",
        listUnsubscribe: "<mailto:leave@updates.example>",
        listUnsubscribePost: "List-Unsubscribe=One-Click",
        precedence: "list",
      }),
      createMessage("m-3", {
        from: '"Weekly Digest" <digest@updates.example>',
        listId: "digest.updates.example",
        listUnsubscribe: "<mailto:leave@updates.example>",
        precedence: "list",
      }),
    ], firstChunk.state);

    expect(secondChunk.groups[0].category).toBe(SENDER_CATEGORIES.NEWSLETTER);
  });

  it("keeps the same classification regardless of message order and chunk boundaries", () => {
    const messages = [
      createMessage("m-1", {
        from: '"Deals" <offers@brand.example>',
        listUnsubscribe: "<https://unsubscribe.mailservice.example/u/1>",
        listUnsubscribePost: "List-Unsubscribe=One-Click",
        precedence: "bulk",
        labelIds: ["UNREAD"],
      }),
      createMessage("m-2", {
        from: '"Deals" <offers@brand.example>',
        listUnsubscribe: "<https://unsubscribe.mailservice.example/u/2>",
        precedence: "bulk",
        labelIds: ["UNREAD"],
      }),
      createMessage("m-3", {
        from: '"Deals" <offers@brand.example>',
        listUnsubscribe: "<https://unsubscribe.mailservice.example/u/3>",
        precedence: "bulk",
        source: SCAN_SOURCES.TRASH,
      }),
    ];
    const onePass = groupAndSanitize(messages).groups;
    const firstChunk = groupAndSanitize(messages.slice(0, 1));
    const chunked = groupAndSanitize(messages.slice(1), firstChunk.state).groups;
    const reversed = groupAndSanitize([...messages].reverse()).groups;

    expect(chunked).toEqual(onePass);
    expect(reversed).toEqual(onePass);
  });

  it("returns the same classification across repeated calls", () => {
    const input = createClassificationInput({
      addresses: [{
        canonicalAddress: "updates@product.example",
        originalAddress: "updates@product.example",
        originalAddresses: ["updates@product.example"],
      }],
      messageCount: 14,
      representativeAddress: "updates@product.example",
      representativeDomain: "product.example",
      senderDomains: ["product.example"],
      unreadCount: 4,
    });

    expect(classifySenderGroup(input)).toEqual(classifySenderGroup(input));
  });

  it("handles missing metadata conservatively", () => {
    const result = classifySenderGroup(createClassificationInput({
      addresses: [],
      representativeAddress: null,
      representativeDomain: null,
      senderDomains: [],
    }));

    expect(result.category).toBe(SENDER_CATEGORIES.UNKNOWN);
  });

  it("does not issue network calls during classification", () => {
    global.fetch = vi.fn();

    classifySenderGroup(createClassificationInput({
      messageCount: 25,
      unreadCount: 20,
    }));

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("does not let classification merge sender groups", () => {
    const { groups } = groupAndSanitize([
      createMessage("m-1", {
        from: '"Brand" <offers@example.com>',
        listUnsubscribe: "<https://unsubscribe.mailservice.example/u/1>",
      }),
      createMessage("m-2", {
        from: '"Brand" <news@example.com>',
        listUnsubscribe: "<https://unsubscribe.mailservice.example/u/2>",
      }),
    ]);

    expect(groups).toHaveLength(2);
  });
});