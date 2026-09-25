# Gmail Quota Notes

This project treats Gmail quota as a first-class constraint.

## Current state

The Gmail client uses only:

- bounded `messages.list` discovery
- metadata-only `messages.get` retrieval
- `messages.trash` for user-selected unread cleanup

## Design direction

The scanner favors:

- `messages.list` over eager full-message fetches
- minimal metadata retrieval
- bounded concurrency
- retry with exponential backoff and jitter
- explicit handling of 429 and transient 5xx failures

The Gmail client foundation currently centralizes the Gmail API costs used by the implemented methods:

- `messages.list`: 5
- `messages.get`: 20
- `messages.trash`: 5

Additional method costs should be introduced only when later phases actually add those operations.

The local quota policy must be treated as application throttling only, not as a claim about Google's live quota enforcement.

## Non-goals

The project must not use a naive `list -> get every message -> process everything` strategy.

## Planned documentation expansion

Further detail can be added later for:

- concurrency defaults
- retry policy
- mailbox scan batching behavior