import { getSenderGroupById } from "@/lib/grouping/sender-grouper";

const CAPTURED_MESSAGE_LIMIT = 4;

export function buildCapturedMessages(scan, groupId) {
  if (!scan || !groupId) {
    return [];
  }

  const group = getSenderGroupById(scan.senderGrouping, groupId);

  if (!group) {
    return [];
  }

  return [...group.messageIds]
    .map((messageId) => scan.normalizedMessagesById.get(messageId))
    .filter(Boolean)
    .sort((left, right) => (right.internalDate || 0) - (left.internalDate || 0))
    .slice(0, CAPTURED_MESSAGE_LIMIT)
    .map((message) => ({
      date: message.headers?.date || null,
      id: message.id,
      internalDate: message.internalDate || null,
      source: message.source || null,
      subject: message.headers?.subject || null,
      unread: Array.isArray(message.labelIds) && message.labelIds.includes("UNREAD"),
    }));
}
