function getHeaderValue(headers, targetName) {
  const match = headers.find((header) => header?.name?.toLowerCase() === targetName.toLowerCase());
  return typeof match?.value === "string" ? match.value : null;
}

export function normalizeGmailMessageMetadata({ message, source }) {
  if (!message?.id || !Array.isArray(message?.payload?.headers)) {
    throw new Error("invalid_message_metadata");
  }

  const internalDate = Number.parseInt(message.internalDate || "", 10);

  return {
    headers: {
      date: getHeaderValue(message.payload.headers, "Date"),
      from: getHeaderValue(message.payload.headers, "From"),
      listId: getHeaderValue(message.payload.headers, "List-ID"),
      listUnsubscribe: getHeaderValue(message.payload.headers, "List-Unsubscribe"),
      listUnsubscribePost: getHeaderValue(message.payload.headers, "List-Unsubscribe-Post"),
      precedence: getHeaderValue(message.payload.headers, "Precedence"),
      replyTo: getHeaderValue(message.payload.headers, "Reply-To"),
      sender: getHeaderValue(message.payload.headers, "Sender"),
      subject: getHeaderValue(message.payload.headers, "Subject"),
      to: getHeaderValue(message.payload.headers, "To"),
    },
    id: message.id,
    internalDate: Number.isFinite(internalDate) ? internalDate : null,
    labelIds: Array.isArray(message.labelIds) ? [...message.labelIds] : [],
    source,
    threadId: typeof message.threadId === "string" ? message.threadId : null,
  };
}