# Pidgeot

Pidgeot is a privacy-first Gmail cleanup application being built in phases. The product goal is to help a user scan Gmail incrementally, group recurring senders, surface deterministic cleanup candidates, and let the user explicitly choose unsubscribe and "move unread to Trash" operations.

The project is designed around explicit user control and minimal retention:

- no database in v1
- no Redis in v1
- no third-party analytics or tracking
- no external AI or LLM calls
- no persistent storage of Gmail message content
- ephemeral cleanup snapshots with a 24-hour TTL in later phases

## Current status

The repository currently includes:

- a Next.js App Router application in JavaScript
- Tailwind CSS v4
- a production scan and cleanup UI plus static documentation routes
- environment configuration with production fail-closed `APP_BASE_URL` and `DEV_SIMULATE_WORKFLOW_EXECUTION` checks
- linting and test setup
- Google OAuth with separate identity-only and Gmail-capable flows
- a process-local incremental Gmail scanner with metadata-only retrieval and pause/resume checkpoints
- deterministic sender identity normalization and session-isolated sender grouping
- deterministic sender classification and observable attention signals
- deterministic unsubscribe mechanism resolution with sanitized browser summaries
- RFC 8058-style automatic unsubscribe execution, plus MAILTO/manual instructions where automatic unsubscribe is unavailable
- user-selected "move unread to Trash" through Gmail Trash, not permanent deletion
- a development-only Development Lab that is unavailable in production

There is no database, Redis, background worker, persistent job queue, or snapshot store. Ephemeral 24-hour cross-device snapshot restoration is not implemented.

## What Pidgeot does

Pidgeot:

- authenticates the user with Google OAuth
- scans Gmail incrementally without loading the full mailbox into memory
- builds conservative sender groups
- classifies sender groups with deterministic local rules
- resolves available unsubscribe mechanisms and submits supported one-click unsubscribe requests
- explains why a sender was surfaced using deterministic signals only
- lets the user explicitly choose unsubscribe and "move unread to Trash"
- stops processing when the active session disappears

Later phases may add restoration of an unexpired cleanup snapshot after the user re-authenticates. That snapshot model is not implemented.

Successful automatic unsubscribe means the unsubscribe request was submitted or completed. Pidgeot does not guarantee that a sender will never send mail again.

## Privacy architecture

Pidgeot processes Gmail data ephemerally and narrowly:

- Gmail passwords are never seen or stored by the app
- Gmail API access uses Google OAuth; OAuth tokens are held in process memory and are not persisted to a database, Redis, filesystem, cookie, localStorage, analytics system, or external tracking service
- there is no application persistence layer, so email bodies, subjects, snippets, attachments, and raw headers are not stored there
- the active auth session may temporarily hold verified email, Google subject, and account key in server memory
- future cleanup snapshots should associate via account key and avoid plaintext email or Google subject unless a demonstrated requirement emerges
- later snapshot retention, if implemented, is capped at 24 hours
- no email data is sent to LLM providers, analytics systems, or ad systems
- the external services used in normal operation are Google OAuth, the Gmail API, and unsubscribe destinations specified by the email when the user runs an automatic unsubscribe

More detail is available in [PRIVACY.md](PRIVACY.md) and [SECURITY.md](SECURITY.md).

## Gmail scopes

Identity sign-in requests `openid` and `email`.

Mailbox access uses a separate explicit flow that adds `https://www.googleapis.com/auth/gmail.modify` only when the user enables Gmail. That is the only Gmail scope requested. The flow uses offline access so a large incremental scan is not limited to one access-token lifetime. A session becomes Gmail-ready only when a refresh token is present and `gmail.modify` was actually granted.

The implemented Gmail API surface is:

- `messages.list`
- metadata-only `messages.get`
- `messages.trash`

The application does not request additional Gmail scopes and does not expose a generic Gmail API proxy.

Scope planning and Google verification guidance live in:

- [docs/google-oauth.md](docs/google-oauth.md)
- [docs/verification.md](docs/verification.md)
- [docs/quota.md](docs/quota.md)

## Environment

Copy `.env.example` to `.env.local` and update the values as needed.

```bash
cp .env.example .env.local
```

Current variables:

- `APP_BASE_URL`: application origin. Development may fall back to localhost. Production requires an explicit absolute `https://` origin and rejects missing, invalid, or localhost values.
- `GITHUB_URL`: public repository URL shown in the interface
- `SESSION_SECRET`: server-side secret for opaque sessions and HMAC-based derivations
- `PROCESSING_LEASE_TTL_SECONDS`: server-side processing lease TTL
- `SCAN_MAX_RETAINED_MESSAGES`: maximum normalized messages retained for one in-memory scan before the scan stops with `RESOURCE_LIMIT_REACHED` (default: `5000`)
- `AUTOMATIC_UNSUBSCRIBE_LEASE_LIMIT`: automatic unsubscribe allowance for the current processing window; manual-only mechanisms and cleanup do not consume this allowance
- `DEV_SIMULATE_WORKFLOW_EXECUTION`: development defaults to simulation when unset. Production must set this explicitly to `true` or `false`; missing or invalid values fail closed. Explicit `true` in production is an operator choice, not a silent default. The Development Lab may override this in development only.
- `GOOGLE_CLIENT_ID`: Google OAuth client ID
- `GOOGLE_CLIENT_SECRET`: Google OAuth client secret
- `GOOGLE_REDIRECT_URI`: configured OAuth callback URL
- Development Lab mail variables (`DEV_MAIL_*`): documented in [docs/development.md](docs/development.md). Development-only. Never required for production.

## Commands

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Run linting:

```bash
npm run lint
```

Run tests:

```bash
npm run test
```

Build the app:

```bash
npm run build
```

Start the production server:

```bash
npm run start
```

## Local development

For local OAuth testing, the recommended path is a Cloudflare Tunnel with the callback URL configured through environment variables. Quick Tunnels are acceptable for temporary OAuth testing but are not the production recommendation.

Setup guidance:

- [docs/development.md](docs/development.md)
- [docs/google-oauth.md](docs/google-oauth.md)

## Phase plan

The specification for this app is intentionally phased. Remaining follow-up items already documented here:

1. Later follow-up: richer unsubscribe UI and optional execution history if warranted.
2. Later follow-up: ephemeral in-memory snapshot storage with TTL and account isolation.

## Routes available now

- `/`: product entry and scan/cleanup UI
- `/privacy`: privacy posture page
- `/security`: security posture page
- `/playground`: Development Lab UI (development only; unavailable in production)
- `/api/auth/google/start`: identity OAuth start endpoint
- `/api/auth/google/gmail/start`: Gmail-capable OAuth start endpoint
- `/api/auth/google/callback`: OAuth callback endpoint
- `/api/auth/session`: authenticated session status endpoint
- `/api/auth/logout`: session invalidation endpoint
- `/api/scan/start`: start a new incremental scan and process the next chunk
- `/api/scan/status`: inspect derived scan state and counters
- `/api/scan/pause`: pause the current scan cooperatively
- `/api/scan/resume`: resume the current scan from its last checkpoint
- `/api/workflow/status`: inspect workflow status for the current session scan
- `/api/workflow/execute`: run user-selected unsubscribe and/or Trash actions for sender groups
- `/api/unsubscribe/execute`: execute supported automatic unsubscribe operations for one sender group
- `/api/cleanup/execute`: move eligible unread messages to Gmail Trash for one sender group

Browser execution requests identify sender groups and requested actions only. Gmail message IDs and unsubscribe URLs are derived server-side.

## Documentation set

- [PRIVACY.md](PRIVACY.md)
- [SECURITY.md](SECURITY.md)
- [docs/architecture.md](docs/architecture.md)
- [docs/development.md](docs/development.md)
- [docs/google-oauth.md](docs/google-oauth.md)
- [docs/quota.md](docs/quota.md)
- [docs/verification.md](docs/verification.md)

## Notes

Because v1 session, scan, and workflow state are process-local, a server restart destroys that in-memory state. That tradeoff is intentional and documented rather than silently replaced with persistent storage. The later snapshot model, if implemented, would share the same process-local constraint.
