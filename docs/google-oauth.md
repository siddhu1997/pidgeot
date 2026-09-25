# Google OAuth Guide

## Current phase scope

The current implementation uses Google authentication, Gmail-capable server-side sessions, incremental metadata scanning, RFC 8058-style unsubscribe execution, and user-selected Gmail Trash cleanup.

## Scope policy

Use the narrowest scopes necessary for the current phase.

Identity flow:

- `openid`
- `email`

Gmail-capable flow:

- `openid`
- `email`
- `https://www.googleapis.com/auth/gmail.modify`

## Why the current scopes are required

- `openid`: allows Google identity assertion in the OAuth flow
- `email`: allows recovery of the authenticated account email needed for account association
- `gmail.modify`: allows metadata scanning and moving user-selected unread messages to Gmail Trash

## Why the Gmail scope remains narrow

The implementation scans mailboxes incrementally through `messages.list` and metadata-only `messages.get`, and it moves user-selected unread messages with `messages.trash`. The scope remains limited to `gmail.modify` without expanding into broader Gmail permissions.

The Gmail-capable flow uses offline access so the server can refresh access tokens during a long-running in-memory session without persisting credentials.

The identity-only flow remains separate and does not silently request Gmail access.

## Environment variables

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `APP_BASE_URL`: development may use a localhost fallback. Production requires an explicit absolute HTTPS origin.
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

A session is Gmail-ready only when both a usable refresh token and a granted `gmail.modify` scope are present. Missing either one leaves the session in the existing consent-required path. Application logout invalidates Pidgeot sessions for that account and does not revoke the Google OAuth grant.