const REQUIRED_FIELDS = [
  "date",
  "fromAddress",
  "fromName",
  "html",
  "id",
  "messageId",
  "subject",
  "text",
  "toAddress",
];

function collapse(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function createRfcMessageId(stableMessageId, fromDomain) {
  const local = String(stableMessageId || "").replace(/[^a-zA-Z0-9._-]+/g, "-");
  return `<pidgeot-dev-${local}@${fromDomain}>`;
}

export function createDevMailMessage(input = {}) {
  const message = {
    date: collapse(input.date),
    fromAddress: collapse(input.fromAddress).toLowerCase(),
    fromName: collapse(input.fromName),
    html: typeof input.html === "string" ? input.html : "",
    id: collapse(input.id),
    listId: collapse(input.listId) || null,
    listUnsubscribe: collapse(input.listUnsubscribe) || null,
    listUnsubscribePost: collapse(input.listUnsubscribePost) || null,
    messageId: collapse(input.messageId),
    precedence: collapse(input.precedence) || "bulk",
    replyTo: collapse(input.replyTo) || null,
    subject: collapse(input.subject),
    text: typeof input.text === "string" ? input.text : "",
    toAddress: collapse(input.toAddress).toLowerCase(),
  };

  for (const field of REQUIRED_FIELDS) {
    if (!message[field]) {
      const error = new Error("The development mail message is missing required fields.");
      error.code = "invalid_generation_request";
      throw error;
    }
  }

  return message;
}

export function toNodemailerMessage(message) {
  const headers = {
    "Message-ID": message.messageId,
    Precedence: message.precedence,
  };

  if (message.listId) {
    headers["List-ID"] = message.listId;
  }

  if (message.listUnsubscribe) {
    headers["List-Unsubscribe"] = message.listUnsubscribe;
  }

  if (message.listUnsubscribePost) {
    headers["List-Unsubscribe-Post"] = message.listUnsubscribePost;
  }

  if (message.replyTo) {
    headers["Reply-To"] = message.replyTo;
  }

  return {
    date: message.date,
    from: `${message.fromName} <${message.fromAddress}>`,
    headers,
    html: message.html,
    messageId: message.messageId.replace(/^<|>$/g, ""),
    subject: message.subject,
    text: message.text,
    to: message.toAddress,
  };
}
