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
- `lib/auth/`: Google OAuth, session cookies, state validation, and Gmail-ready session helpers
- `lib/gmail/`: Gmail client and quota-aware request wrapper
- `lib/scanning/`: incremental mailbox traversal, checkpointing, and metadata normalization
- `lib/grouping/`: deterministic sender identity normalization and sender grouping
- `lib/classification/`: deterministic candidate classification
- `lib/unsubscribe/`: standards-first unsubscribe detection, URL/DNS validation, and execution
- `lib/cleanup/`: user-selected Gmail Trash execution against the current scan snapshot
- `lib/workflow/`: sender-group workflow orchestration, including optional development simulation
- `lib/sessions/`: process-local active session and processing-lease abstractions; later snapshot modules are not present
- `lib/dev-lab/`: development-only mail generation, workflow scenarios, and unsubscribe target. Never imported by production scanner, classifier, grouping, OAuth, or execution code.
- `lib/dev-mail/`: development-only Brevo/Mailgun adapter, failover, and provider-neutral message model. Never imported by production scanner, classifier, grouping, OAuth, or execution code.

## Storage model

v1 intentionally avoids a database and Redis. Active auth and later snapshot state must be abstracted behind dedicated in-memory modules rather than scattered `Map` access.

## Session model

The application uses server-side opaque session identifiers. The browser stores only the opaque session cookie. Sensitive token material is intended to remain server-side.

That browser session cookie must contain only the opaque session ID. It must not contain email, Google subject, account key, OAuth tokens, or Gmail data.

The active authentication session is a process-local in-memory record. It may temporarily contain the verified email, Google subject, and derived account key because those values are needed to maintain the authenticated session. Account key is an internal server-side identifier and is not included in browser-facing session or scan payloads.

One Google account has at most one active Pidgeot session in the process. A successful identity login replaces existing sessions for that account key. Logout invalidates all sessions for that account key. This is application-session invalidation, not Google grant revocation.

Once Gmail access is enabled, that same active session may also temporarily contain a refresh token, current access token, access-token expiry metadata, and a Gmail auth state such as `GMAIL_READY` or `REAUTH_REQUIRED`. These values remain server-only, process-local, and memory-only. `GMAIL_READY` requires both usable refresh-token state and a granted `gmail.modify` scope.

Offline access is required for the Gmail-capable session because a large incremental mailbox scan must not fail arbitrarily after a single access-token lifetime. The refresh token is used only in server memory to obtain fresh access tokens when needed.

If Gmail refresh fails because the credential is invalid, revoked, or otherwise unusable, the session transitions to `REAUTH_REQUIRED`. At that point no new Gmail processing should begin until the user re-authenticates.

## Processing lease

Authenticated session ownership and active processing ownership are distinct.

The authenticated session proves the user identity for the current server process.

The processing lease is a separate process-local in-memory record tied to one authenticated session. It carries only operational ownership data such as lease ID, session ID, timestamps, expiry, and state. It never stores Gmail tokens or Gmail content.

New scan or cleanup work requires both:

- an authenticated session in a Gmail-capable ready state
- a valid processing lease owned by that session

The lease has a configured TTL. If the lease expires or is explicitly paused, no new processing begins, although already in-flight work may finish where practical.

## Snapshot model

Later phases will add a separate ephemeral snapshot model for cross-device restoration. Authentication and snapshot lookup remain distinct concerns.

That future cleanup snapshot must remain conceptually separate from the active auth session. The snapshot should associate work to the derived account key and should not store plaintext email or Google subject unless a demonstrated functional requirement appears.

Gmail credentials are never part of the 24-hour cleanup snapshot.

That snapshot model is planned only. It is not implemented, and process restart does not currently restore cleanup progress across devices.

## Gmail client boundary

All Gmail API access must flow through a narrow server-side Gmail client facade. The browser never calls Gmail directly, never receives Gmail OAuth tokens, and never receives arbitrary Gmail API responses.

The facade supports only:

- `messages.list`
- metadata-only `messages.get`
- `messages.trash`

It does not expose full-message or body retrieval, permanent deletion, or arbitrary Gmail API proxy behavior. Browser execution endpoints accept sender-group identities and requested actions; Gmail message IDs and unsubscribe URLs are derived server-side.

The Gmail client boundary centralizes:

- in-memory credential use and refresh
- quota accounting policy
- retry/backoff policy
- Gmail error mapping
- processing lease enforcement

## Scan model

Phase 2B adds a process-local incremental scan engine layered on top of the Gmail client boundary.

The scan engine:

- traverses Gmail through bounded `messages.list` pages
- keeps Active Mail and Trash pagination/checkpoint state independent
- fetches only Gmail metadata using `messages.get` with an explicit header allowlist
- normalizes the metadata into a deterministic internal representation
- makes partial normalized results available in process-local scan state as each chunk commits
- never fetches bodies, attachments, snippets, or full MIME payloads
- never modifies Gmail state; Trash mutation is a separate user-selected cleanup step

The scan checkpoint remains process-local and ephemeral. It stores only scan IDs, source state, page tokens, bounded pending message IDs for the current page, counters, timestamps, and normalized metadata needed by later phases.

## Sender grouping model

Phase 3A adds a deterministic sender-grouping layer that consumes the normalized scan message stream and updates session-local sender groups incrementally.

The grouping layer:

- groups by exact canonical sender address when available
- uses normalized `List-ID` as strong multi-address grouping evidence
- never merges solely on shared domain or display name
- keeps sender domains distinct from unsubscribe service domains derived from unsubscribe metadata
- aggregates total, unread, active-mail, and trash counts without making additional Gmail API calls
- stores deterministic grouping signals so later UI can explain why messages were grouped

Sender-group state remains embedded in the process-local scan state. It is session-isolated, sanitized before API responses, and does not expose raw Gmail payloads or arbitrary header blobs.

## Classification model

Phase 3B adds a pure deterministic sender classifier layered on top of sender-group aggregates.

The classifier:

- consumes sender-group counts, header-derived aggregates, sender-domain data, and unsubscribe-infrastructure observations
- produces one category from `PROMOTIONAL`, `NEWSLETTER`, `SOCIAL`, `NOTIFICATION`, `TRANSACTIONAL`, `UPDATES`, or `UNKNOWN`
- derives an independent `HIGH`, `MEDIUM`, or `LOW` attention level from observable engagement and volume signals
- records structured classification and attention signals for explainability
- never merges groups, fetches additional Gmail data, or calls external services

Classification is recomputed from the latest sender-group aggregate state whenever scan summaries are sanitized, so chunk boundaries and message order do not change the result.

## Unsubscribe resolution model

Phase 4A adds a deterministic unsubscribe-resolution layer on top of sender-group evidence.

The resolver:

- parses `List-Unsubscribe` and `List-Unsubscribe-Post` observations already captured from normalized Gmail metadata
- resolves RFC 8058 one-click HTTPS targets separately from normal HTTPS pages and `mailto:` operations
- rejects unsafe or unsupported targets syntactically without performing DNS lookups or network requests
- deduplicates identical operations conservatively while preserving distinct mechanisms
- exposes only sanitized mechanism summaries in browser-facing scan state while keeping raw operational targets server-side

Network-level SSRF protection, DNS validation, redirect validation, and unsubscribe execution are handled by the separate execution layer below.

## Unsubscribe execution model

Phase 4B adds a separate security-critical execution layer.

The execution layer:

- accepts only session-owned sender-group identities from the browser and re-resolves current server-side operations from scan state
- executes only explicitly supported automatic operations, currently RFC 8058 one-click HTTPS targets
- performs DNS resolution and validates every resolved address before connecting
- pins each outbound HTTPS request to a validated address so transport resolution cannot silently diverge from validation
- revalidates redirect targets and enforces bounded redirects, strict timeouts, bounded response size, and bounded retries
- never forwards Gmail credentials, browser cookies, browser authorization headers, or arbitrary browser-supplied request data
- keeps idempotency and duplicate-execution guards in process-local memory only

Normal HTTPS pages that require interaction, authentication, JavaScript, form discovery, cookies, or other unsupported flows remain manual. MAILTO targets are presented as instructions for the user. A submitted or completed unsubscribe request does not guarantee that the sender will never send mail again.

## Cleanup execution model

User-selected cleanup moves eligible unread messages to Gmail Trash through `messages.trash`. It does not permanently delete mail.

The current scan snapshot is authoritative for cleanup eligibility. Gmail may have changed since discovery. If Trash rejects an individual message as no longer mutable, that message is skipped and reconciled as no longer actionable; the workflow can complete when no actionable work remains. Authentication, quota, retryable network, and other systemic failures remain failures. Cleanup does not add a pre-trash Gmail metadata re-fetch.

## Workflow simulation

Development may default workflow execution to simulation when `DEV_SIMULATE_WORKFLOW_EXECUTION` is unset. The Development Lab may override that mode in development only.

Production does not silently default to simulation or live execution. Production requires an explicit `true` or `false` value; missing or invalid configuration fails closed. An operator may still set the flag to `true` in production.

## Runtime model

The intended deployment model favors a traditional Node.js process or similar long-lived runtime because the v1 architecture depends on process-local ephemeral state.

## Tradeoff

Because v1 uses process-local state, a process restart destroys active sessions, scans, leases, and workflow memory. This is intentional in v1 and accepted explicitly rather than being hidden behind premature persistent storage. The later snapshot model, if implemented, would share that process-local constraint.

That same restart also destroys in-memory Gmail credential state and any active processing leases.