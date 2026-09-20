import dns from "node:dns";
import http from "node:http";
import https from "node:https";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getSenderGroupingStateShape,
  ingestMessagesIntoSenderGroups,
  listSanitizedSenderGroups,
} from "@/lib/grouping/sender-grouper";
import { SCAN_SOURCES } from "@/lib/scanning/constants";
import { resolveUnsubscribeMechanisms } from "@/lib/unsubscribe/resolver";

function createObservation(listUnsubscribe, listUnsubscribePost = null) {
  return {
    listUnsubscribe,
    listUnsubscribePost,
  };
}

function createMessage(id, {
  from = "updates@example.com",
  listId = null,
  listUnsubscribe = null,
  listUnsubscribePost = null,
  source = SCAN_SOURCES.ACTIVE_MAIL,
} = {}) {
  return {
    headers: {
      from,
      listId,
      listUnsubscribe,
      listUnsubscribePost,
      precedence: null,
      replyTo: null,
      sender: null,
    },
    id,
    labelIds: [],
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

describe("unsubscribe resolver", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns UNAVAILABLE when no unsubscribe metadata exists", () => {
    const result = resolveUnsubscribeMechanisms({ observations: [] });

    expect(result.summary).toEqual({
      mechanisms: [],
      resolutionStatus: "UNAVAILABLE",
    });
  });

  it("resolves valid RFC 8058 metadata as AUTOMATIC", () => {
    const result = resolveUnsubscribeMechanisms({
      observations: [createObservation(
        "<https://u.example.com/unsub?id=1>",
        "List-Unsubscribe=One-Click",
      )],
    });

    expect(result.operations).toEqual([
      expect.objectContaining({
        scheme: "https",
        status: "AUTOMATIC",
        type: "RFC8058_ONE_CLICK",
      }),
    ]);
    expect(result.summary).toEqual({
      mechanisms: [{
        automatic: true,
        manualActionRequired: false,
        status: "AUTOMATIC",
        type: "RFC8058_ONE_CLICK",
      }],
      resolutionStatus: "AUTOMATIC",
    });
  });

  it("keeps HTTPS List-Unsubscribe without one-click semantics as manual", () => {
    const result = resolveUnsubscribeMechanisms({
      observations: [createObservation("<https://example.com/unsubscribe?id=1>")],
    });

    expect(result.operations[0]).toEqual(expect.objectContaining({
      status: "MANUAL_ACTION_REQUIRED",
      type: "HTTPS_LINK",
    }));
  });

  it("parses valid mailto targets as manual action only", () => {
    const result = resolveUnsubscribeMechanisms({
      observations: [createObservation("<mailto:leave@example.com?subject=unsubscribe&body=please%20remove>")],
    });

    expect(result.operations[0]).toEqual(expect.objectContaining({
      mailto: expect.objectContaining({
        body: "please remove",
        recipient: "leave@example.com",
        subject: "unsubscribe",
      }),
      status: "MANUAL_ACTION_REQUIRED",
      type: "MAILTO",
    }));
  });

  it("supports multiple List-Unsubscribe targets and deduplicates identical operations", () => {
    const result = resolveUnsubscribeMechanisms({
      observations: [createObservation(
        "<https://example.com/unsub>, <mailto:leave@example.com>, <https://example.com/unsub>, <mailto:leave@example.com>",
      )],
    });

    expect(result.operations).toHaveLength(2);
    expect(result.summary.mechanisms).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "HTTPS_LINK" }),
      expect.objectContaining({ type: "MAILTO" }),
    ]));
  });

  it("keeps different URLs on the same domain as distinct operations", () => {
    const result = resolveUnsubscribeMechanisms({
      observations: [createObservation(
        "<https://example.com/unsub/a>, <https://example.com/unsub/b>",
      )],
    });

    expect(result.operations).toHaveLength(2);
  });

  it("rejects javascript, data, file, and ftp schemes as unsafe", () => {
    const result = resolveUnsubscribeMechanisms({
      observations: [createObservation(
        "<javascript:alert(1)>, <data:text/plain,hello>, <file:///tmp/x>, <ftp://example.com/x>",
      )],
    });

    expect(result.operations).toHaveLength(4);
    expect(result.operations.every((operation) => operation.status === "UNSAFE")).toBe(true);
  });

  it("rejects malformed URLs and embedded credentials", () => {
    const result = resolveUnsubscribeMechanisms({
      observations: [createObservation(
        "<https://user:pass@example.com/unsub>, <https://[::1>",
      )],
    });

    expect(result.operations).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: "EMBEDDED_CREDENTIALS", status: "UNSAFE" }),
      expect.objectContaining({ reason: "MALFORMED_URL", status: "UNSAFE" }),
    ]));
  });

  it("rejects localhost, loopback, private IPv4, private IPv6, link-local, and metadata hosts", () => {
    const result = resolveUnsubscribeMechanisms({
      observations: [createObservation(
        "<https://localhost/unsub>, <https://127.0.0.1/unsub>, <https://10.0.0.1/unsub>, <https://[::1]/unsub>, <https://[fe80::1]/unsub>, <https://169.254.169.254/latest>, <https://metadata.google.internal/path>",
      )],
    });

    expect(result.operations.every((operation) => operation.status === "UNSAFE")).toBe(true);
  });

  it("does not follow redirects and does not perform DNS or network calls during resolution", () => {
    const fetchSpy = vi.fn();
    const dnsLookupSpy = vi.spyOn(dns, "lookup");
    const httpRequestSpy = vi.spyOn(http, "request");
    const httpsRequestSpy = vi.spyOn(https, "request");
    global.fetch = fetchSpy;

    const result = resolveUnsubscribeMechanisms({
      observations: [createObservation("<https://example.com/redirect?to=https://internal.example>")],
    });

    expect(result.operations[0]).toEqual(expect.objectContaining({
      status: "MANUAL_ACTION_REQUIRED",
      type: "HTTPS_LINK",
    }));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(dnsLookupSpy).not.toHaveBeenCalled();
    expect(httpRequestSpy).not.toHaveBeenCalled();
    expect(httpsRequestSpy).not.toHaveBeenCalled();
  });

  it("requires valid List-Unsubscribe-Post semantics for RFC 8058", () => {
    const result = resolveUnsubscribeMechanisms({
      observations: [createObservation(
        "<https://example.com/unsub>",
        "x-not-one-click=true",
      )],
    });

    expect(result.operations[0]).toEqual(expect.objectContaining({
      status: "MANUAL_ACTION_REQUIRED",
      type: "HTTPS_LINK",
    }));
  });

  it("handles uppercase schemes, whitespace, punycode, unusual ports, fragments, and query strings deterministically", () => {
    const result = resolveUnsubscribeMechanisms({
      observations: [createObservation(
        " <HTTPS://xn--bcher-kva.example.:8443/unsub?q=1#fragment> , <MAILTO:Leave@Example.com?subject=Stop> ",
        " List-Unsubscribe=One-Click ",
      )],
    });

    expect(result.operations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        host: "xn--bcher-kva.example",
        port: "8443",
        status: "AUTOMATIC",
        type: "RFC8058_ONE_CLICK",
      }),
      expect.objectContaining({
        mailto: expect.objectContaining({ recipient: "leave@example.com" }),
        status: "MANUAL_ACTION_REQUIRED",
        type: "MAILTO",
      }),
    ]));
  });

  it("keeps multiple mechanisms independently represented", () => {
    const result = resolveUnsubscribeMechanisms({
      observations: [
        createObservation(
          "<https://example.com/one-click>, <mailto:leave@example.com>",
          "List-Unsubscribe=One-Click",
        ),
        createObservation("<https://example.com/preferences>"),
      ],
    });

    expect(result.summary.mechanisms).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "RFC8058_ONE_CLICK" }),
      expect.objectContaining({ type: "HTTPS_LINK" }),
      expect.objectContaining({ type: "MAILTO" }),
    ]));
  });

  it("can upgrade from unavailable to automatic as new evidence arrives incrementally", () => {
    const first = groupAndSanitize([
      createMessage("m-1", { from: "digest@example.com" }),
    ]);

    expect(first.groups[0].unsubscribe).toEqual({
      mechanisms: [],
      resolutionStatus: "UNAVAILABLE",
    });

    const second = groupAndSanitize([
      createMessage("m-2", {
        from: "digest@example.com",
        listUnsubscribe: "<https://example.com/unsub?id=2>",
        listUnsubscribePost: "List-Unsubscribe=One-Click",
      }),
    ], first.state);

    expect(second.groups[0].unsubscribe).toEqual({
      mechanisms: [{
        automatic: true,
        manualActionRequired: false,
        status: "AUTOMATIC",
        type: "RFC8058_ONE_CLICK",
      }],
      resolutionStatus: "AUTOMATIC",
    });
  });

  it("does not duplicate operations across duplicate message observations and remains deterministic across order and chunking", () => {
    const messages = [
      createMessage("m-1", {
        from: "digest@example.com",
        listUnsubscribe: "<https://example.com/unsub>, <mailto:leave@example.com>",
      }),
      createMessage("m-2", {
        from: "digest@example.com",
        listUnsubscribe: "<https://example.com/unsub>, <mailto:leave@example.com>",
      }),
      createMessage("m-1", {
        from: "digest@example.com",
        listUnsubscribe: "<https://example.com/unsub>, <mailto:leave@example.com>",
      }),
    ];

    const onePass = groupAndSanitize(messages).groups[0].unsubscribe;
    const chunkedFirst = groupAndSanitize(messages.slice(0, 1));
    const chunked = groupAndSanitize(messages.slice(1), chunkedFirst.state).groups[0].unsubscribe;
    const reversed = groupAndSanitize([...messages].reverse()).groups[0].unsubscribe;

    expect(onePass.mechanisms).toHaveLength(2);
    expect(chunked).toEqual(onePass);
    expect(reversed).toEqual(onePass);
  });

  it("does not let classification affect mechanism resolution and keeps sender identity separate from infrastructure domains", () => {
    const first = groupAndSanitize([
      createMessage("m-1", {
        from: "offers@example.com",
        listUnsubscribe: "<https://sendgrid.net/unsub/1>",
      }),
    ]).groups[0];
    const second = groupAndSanitize([
      createMessage("m-1", {
        from: "offers@example.com",
        listUnsubscribe: "<https://sendgrid.net/unsub/1>",
        listId: "stream.example",
      }),
      createMessage("m-2", {
        from: "offers@example.com",
        listUnsubscribe: "<https://sendgrid.net/unsub/1>",
        listId: "stream.example",
      }),
      createMessage("m-3", {
        from: "offers@example.com",
        listUnsubscribe: "<https://sendgrid.net/unsub/1>",
        listId: "stream.example",
      }),
    ]).groups[0];

    expect(first.unsubscribe).toEqual(second.unsubscribe);
    expect(second.senderDomains).toEqual(["example.com"]);
    expect(second.unsubscribeServiceDomains).toEqual(["sendgrid.net"]);
  });

  it("does not expose raw unsubscribe targets in sanitized browser-facing group state and preserves session isolation", () => {
    const firstState = groupAndSanitize([
      createMessage("a-1", {
        from: "digest@example.com",
        listUnsubscribe: "<https://example.com/unsub?token=secret>",
      }),
    ]);
    const secondState = groupAndSanitize([
      createMessage("b-1", {
        from: "alerts@other.example",
      }),
    ]);

    expect(firstState.groups[0].unsubscribe.mechanisms[0]).not.toHaveProperty("target");
    expect(firstState.groups[0].unsubscribe.mechanisms[0]).not.toHaveProperty("mailto");
    expect(secondState.groups[0].unsubscribe).toEqual({
      mechanisms: [],
      resolutionStatus: "UNAVAILABLE",
    });
  });
});