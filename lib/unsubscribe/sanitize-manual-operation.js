import {
  UNSUBSCRIBE_OPERATION_STATUSES,
  UNSUBSCRIBE_OPERATION_TYPES,
} from "@/lib/unsubscribe/constants";

function isSafeSanitizedMailtoRecipient(recipient) {
  if (typeof recipient !== "string" || !recipient) {
    return false;
  }

  if (/[\s<>"'/:]/.test(recipient)) {
    return false;
  }

  return recipient.includes("@");
}

function buildSanitizedMailtoHref({ recipient, subject, body }) {
  if (!isSafeSanitizedMailtoRecipient(recipient)) {
    return null;
  }

  const params = [];

  if (typeof subject === "string" && subject) {
    params.push(`subject=${encodeURIComponent(subject)}`);
  }

  if (typeof body === "string" && body) {
    params.push(`body=${encodeURIComponent(body)}`);
  }

  return params.length > 0 ? `mailto:${recipient}?${params.join("&")}` : `mailto:${recipient}`;
}

export function sanitizeManualUnsubscribeOperation(operation) {
  if (!operation || operation.status !== UNSUBSCRIBE_OPERATION_STATUSES.MANUAL_ACTION_REQUIRED) {
    return null;
  }

  if (operation.type === UNSUBSCRIBE_OPERATION_TYPES.MAILTO) {
    const recipient = operation.mailto?.recipient || null;
    const subject = operation.mailto?.subject || null;
    const body = operation.mailto?.body || null;

    return {
      id: operation.id,
      mailto: operation.mailto
        ? {
          body,
          href: buildSanitizedMailtoHref({ body, recipient, subject }),
          recipient,
          subject,
        }
        : null,
      status: operation.status,
      type: operation.type,
    };
  }

  if (
    operation.type === UNSUBSCRIBE_OPERATION_TYPES.HTTPS_LINK
    || operation.type === UNSUBSCRIBE_OPERATION_TYPES.HTTP_LINK
  ) {
    return {
      host: operation.host || null,
      id: operation.id,
      path: operation.path || "/",
      scheme: operation.scheme || null,
      status: operation.status,
      target: operation.type === UNSUBSCRIBE_OPERATION_TYPES.HTTPS_LINK ? operation.target || null : null,
      type: operation.type,
    };
  }

  return {
    id: operation.id,
    status: operation.status,
    type: operation.type,
  };
}
