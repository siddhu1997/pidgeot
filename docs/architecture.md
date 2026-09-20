# Architecture Notes

## Goals

Pidgeot is designed to be:

- privacy-first
- deterministic
- open source
- quota-aware
- explainable
- explicit about user control

## Core architectural boundaries

- `app/`: UI routes and API routes
- `lib/auth/`: Google OAuth, session cookies, state validation
- `lib/gmail/`: Gmail client and quota-aware request wrapper
- `lib/scanning/`: incremental mailbox traversal and aggregation
- `lib/classification/`: deterministic candidate classification
- `lib/unsubscribe/`: standards-first unsubscribe detection and execution
- `lib/sessions/`: process-local active session and later snapshot abstractions
- `lib/security/`: URL validation, cookie rules, CSRF, sanitization helpers

## Storage model

v1 intentionally avoids a database and Redis. Active auth and later snapshot state must be abstracted behind dedicated in-memory modules rather than scattered `Map` access.

## Session model

The application uses server-side opaque session identifiers. The browser stores only the opaque session cookie. Sensitive token material is intended to remain server-side.

That browser session cookie must contain only the opaque session ID. It must not contain email, Google subject, account key, OAuth tokens, or Gmail data.

The active authentication session is a process-local in-memory record. It may temporarily contain the verified email, Google subject, and derived account key because those values are needed to maintain the authenticated session and support future authenticated cross-device restoration.

Once Gmail access is enabled, that same active session may also temporarily contain a refresh token, current access token, access-token expiry metadata, and a Gmail auth state such as `GMAIL_READY` or `REAUTH_REQUIRED`. These values remain server-only, process-local, and memory-only.

Offline access is required for the Gmail-capable session because a large incremental mailbox scan must not fail arbitrarily after a single access-token lifetime. The refresh token is used only in server memory to obtain fresh access tokens when needed.

If Gmail refresh fails because the credential is invalid, revoked, or otherwise unusable, the session transitions to `REAUTH_REQUIRED`. At that point no new Gmail processing should begin until the user re-authenticates.

## Processing lease

Authenticated session ownership and active processing ownership are distinct.

The authenticated session proves the user identity for the current server process.

The processing lease is a separate process-local in-memory record tied to one authenticated session. It carries only operational ownership data such as lease ID, session ID, timestamps, expiry, and state. It never stores Gmail tokens or Gmail content.

New scan or cleanup work requires both:

- an authenticated session in a Gmail-capable ready state
- a valid processing lease owned by that session

Heartbeat renews the lease while the client is actively using the application. If the lease expires or is explicitly paused, no new processing begins, although already in-flight work may finish where practical.

## Snapshot model

Later phases will add a separate ephemeral snapshot model for cross-device restoration. Authentication and snapshot lookup remain distinct concerns.

That future cleanup snapshot must remain conceptually separate from the active auth session. The snapshot should associate work to the derived account key and should not store plaintext email or Google subject unless a demonstrated functional requirement appears.

Gmail credentials are never part of the 24-hour cleanup snapshot.

## Gmail client boundary

All Gmail API access must flow through a narrow server-side Gmail client facade. The browser never calls Gmail directly, never receives Gmail OAuth tokens, and never receives arbitrary Gmail API responses.

In Phase 2A, that facade is intentionally narrower than a mailbox client. It does not yet expose mailbox listing, pagination, full-message or body retrieval, or Trash mutation. Those operational capabilities remain deferred to later phases.

The Gmail client boundary centralizes:

- in-memory credential use and refresh
- quota accounting policy
- retry/backoff policy
- Gmail error mapping
- processing lease enforcement

## Runtime model

The intended deployment model favors a traditional Node.js process or similar long-lived runtime because the v1 architecture depends on process-local ephemeral state.

## Tradeoff

Because v1 uses process-local state, a process restart destroys active sessions and snapshots. This is intentional in v1 and accepted explicitly rather than being hidden behind premature persistent storage.

That same restart also destroys in-memory Gmail credential state and any active processing leases.