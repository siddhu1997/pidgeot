import {
  UNSUBSCRIBE_OPERATION_STATUSES,
  UNSUBSCRIBE_OPERATION_TYPES,
} from "@/lib/unsubscribe/constants";

export function sanitizeManualUnsubscribeOperation(operation) {
  if (!operation || operation.status !== UNSUBSCRIBE_OPERATION_STATUSES.MANUAL_ACTION_REQUIRED) {
    return null;
  }

  if (operation.type === UNSUBSCRIBE_OPERATION_TYPES.MAILTO) {
    return {
      id: operation.id,
      mailto: operation.mailto
        ? {
          recipient: operation.mailto.recipient || null,
          subject: operation.mailto.subject || null,
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
