# Gmail Quota Notes

This project treats Gmail quota as a first-class constraint.

## Current state

The repository does not yet perform Gmail API mailbox scanning. Phase 2A only establishes the Gmail foundation needed to centralize credential refresh, lease enforcement, retry behavior, and quota accounting for the narrow metadata boundary.

## Design direction

When Gmail integration is added, the scanner must favor:

- `messages.list` over eager full-message fetches
- minimal metadata retrieval
- bounded concurrency
- retry with exponential backoff and jitter
- explicit handling of 429 and transient 5xx failures

The Gmail client foundation currently centralizes only the Gmail API cost used by the active Phase 2A boundary:

- `messages.get`: 20

Additional method costs should be introduced only when later phases actually add those operations.

The local quota policy must be treated as application throttling only, not as a claim about Google's live quota enforcement.

## Non-goals

The project must not use a naive `list -> get every message -> process everything` strategy.

## Planned documentation expansion

As the Gmail client lands, this document should be updated with:

- approximate quota cost assumptions
- concurrency defaults
- retry policy
- mailbox scan batching behavior