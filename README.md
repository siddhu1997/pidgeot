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

Phase 4B safe unsubscribe-execution infrastructure is now in place. The repository currently includes:

- a Next.js App Router scaffold in JavaScript
- Tailwind CSS v4
- a baseline product shell and static documentation routes
- lightweight environment configuration and session planning
- linting and test setup
- Google OAuth implementation scaffolding with separate identity-only and Gmail-capable flows
- a process-local incremental Gmail scanner with metadata-only retrieval and pause/resume checkpoints
- deterministic sender identity normalization and session-isolated sender grouping
- deterministic sender classification and observable attention signals
- deterministic unsubscribe mechanism resolution with safe browser summaries and no execution
- safe RFC 8058 unsubscribe execution with server-only operation lookup and SSRF-aware transport controls

The repository does not yet include Gmail cleanup execution, ephemeral snapshot restoration, or real-time cleanup queue processing.

## What Pidgeot will do

When complete, Pidgeot will:

- authenticate the user with Google OAuth
- scan Gmail incrementally without loading the full mailbox into memory
- build conservative sender groups
- classify sender groups with deterministic local rules
- resolve available unsubscribe mechanisms and safely submit supported one-click requests
- explain why a sender was surfaced using deterministic signals only
- let the user explicitly choose unsubscribe and "move unread to Trash"
- stop processing when the active session disappears
- allow restoration of an unexpired snapshot after the user re-authenticates

## Privacy architecture

Pidgeot is being built so that Gmail data is processed ephemerally and narrowly:

- Gmail passwords are never seen or stored by the app
- OAuth tokens are intended to remain transient in server memory only
- no Gmail bodies, subjects, attachments, or raw headers are persisted
- the active auth session may temporarily hold verified email, Google subject, and account key
- future cleanup snapshots should associate via account key and avoid plaintext email or Google subject unless a demonstrated requirement emerges
- later snapshot retention is capped at 24 hours
- no email data is sent to LLM providers, analytics systems, or ad systems
- the only intended external services in normal operation are Google OAuth, Gmail API, and user-selected unsubscribe endpoints

More detail is available in [PRIVACY.md](PRIVACY.md) and [SECURITY.md](SECURITY.md).

## Gmail scopes

The long-term target scope for mailbox cleanup is `https://www.googleapis.com/auth/gmail.modify` because the application must read relevant Gmail metadata and move user-selected unread messages to Trash.

During the current auth-only stage, the implementation uses the narrowest identity scope needed to authenticate the Google account and recover the account email for session association.

The Gmail-capable foundation uses a separate explicit flow that adds `gmail.modify` only when the user enables mailbox access. That flow requests offline access so a large incremental scan is not arbitrarily limited to one access-token lifetime. Refresh tokens remain process-local and memory-only.

Phase 2B adds incremental mailbox discovery, Gmail pagination, and metadata-only retrieval. Full-message or body retrieval, unsubscribe handling, and Trash mutation remain deferred to later phases.

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

- `APP_BASE_URL`: local or deployed application origin
- `GITHUB_URL`: public repository URL shown in the interface
- `SESSION_SECRET`: server-side secret for opaque sessions and HMAC-based derivations
- `PROCESSING_LEASE_TTL_SECONDS`: server-side processing lease TTL
- `SCAN_MAX_RETAINED_MESSAGES`: maximum normalized messages retained for one in-memory scan before the scan stops with `RESOURCE_LIMIT_REACHED` (default: `5000`)
- `AUTOMATIC_UNSUBSCRIBE_LEASE_LIMIT`: automatic unsubscribe allowance for the current processing window; manual-only mechanisms and cleanup do not consume this allowance
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

The specification for this app is intentionally phased. The next major implementation steps are:

1. Phase 4C: cleanup queue and Trash operations.
2. Later follow-up: richer unsubscribe UI and optional execution history if warranted.
3. Later follow-up: ephemeral in-memory snapshot storage with TTL and account isolation.

## Routes available now

- `/`: product shell and mocked queue preview
- `/privacy`: privacy posture page
- `/security`: security posture page
- `/api/auth/google/start`: OAuth start endpoint
- `/api/auth/google/callback`: OAuth callback endpoint
- `/api/auth/session`: authenticated session status endpoint
- `/api/auth/logout`: session invalidation endpoint
- `/api/scan/start`: start a new incremental scan and process the next chunk
- `/api/scan/status`: inspect derived scan state and counters
- `/api/scan/pause`: pause the current scan cooperatively
- `/api/scan/resume`: resume the current scan from its last checkpoint
- `/api/unsubscribe/execute`: execute supported unsubscribe operations for one sender group by server-owned identity only

## Documentation set

- [PRIVACY.md](PRIVACY.md)
- [SECURITY.md](SECURITY.md)
- [docs/architecture.md](docs/architecture.md)
- [docs/development.md](docs/development.md)
- [docs/google-oauth.md](docs/google-oauth.md)
- [docs/quota.md](docs/quota.md)
- [docs/verification.md](docs/verification.md)

## Notes

The current UI still uses explicit placeholder data for the sender cards and queue preview. This is deliberate because Phase 4B adds the server-side unsubscribe execution foundation only; richer unsubscribe and cleanup UI are still later-phase work.

Because the long-term session and snapshot model is process-local in v1, a server restart destroys active sessions and snapshots. That tradeoff is intentional and documented rather than silently replaced with persistent storage.
