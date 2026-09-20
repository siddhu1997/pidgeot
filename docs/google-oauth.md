# Google OAuth Guide

## Current phase scope

The current implementation phase is limited to Google authentication and authenticated session establishment. Gmail cleanup actions are not yet implemented.

## Scope policy

Use the narrowest scopes necessary for the current phase.

Current auth-only implementation target:

- `openid`
- `email`

Gmail-capable implementation target:

- `https://www.googleapis.com/auth/gmail.modify`

## Why the current scopes are required

- `openid`: allows Google identity assertion in the OAuth flow
- `email`: allows recovery of the authenticated account email needed for account association and future snapshot restoration

## Why Gmail cleanup scope is deferred

The current phase does not scan mailboxes or modify Gmail state, so requesting `gmail.modify` now would violate the narrow-scope requirement.

When Gmail processing is explicitly enabled by the user, the Gmail-capable flow should request:

- `openid`
- `email`
- `https://www.googleapis.com/auth/gmail.modify`

That Gmail-capable flow should use offline access so the server can refresh access tokens during a long-running in-memory session without persisting credentials.

The Phase 1 identity-only flow must remain separate and must not silently request Gmail access.

## Environment variables

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `APP_BASE_URL`
- `SESSION_SECRET`

## Local callback shape

Expected callback route:

`/api/auth/google/callback`

The exact redirect URI must be configured in Google Cloud and must match the environment value.

## Production note

Production OAuth must use a stable HTTPS domain, not a temporary tunnel URL.

## Credential handling

The Gmail-capable flow may yield a refresh token. That refresh token must remain:

- process-local
- server-only
- memory-only

It must never be written to cookies, localStorage, sessionStorage, logs, or cleanup snapshots.

If Google does not return a usable refresh token during the Gmail-capable consent flow, the session must not be treated as Gmail-capable.