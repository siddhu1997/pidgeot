# Security Overview

Pidgeot is being built for inspection by privacy-conscious users, Google OAuth reviewers, and security researchers.

## Threat model highlights

The highest-risk surfaces are:

- Google OAuth state handling
- server-side session integrity
- transient OAuth credential handling
- unsubscribe fallback SSRF risk
- redirect safety
- cross-account snapshot isolation
- logging and error sanitization

## Current controls

The application currently:

- uses cryptographically random opaque session identifiers
- keeps session cookies `HttpOnly` and `SameSite=Lax`
- marks cookies `Secure` in production
- validates OAuth `state` and uses PKCE
- keeps one active Pidgeot session per account key
- confines OAuth tokens to process memory and does not persist them
- requires `gmail.modify` plus a refresh token before a session is Gmail-ready
- validates unsubscribe targets, pins DNS, and bounds redirects, timeouts, and retries
- applies local quota-aware retry and backoff around the implemented Gmail methods
- avoids browser-accessible token storage
- avoids third-party analytics, tracking, and error-reporting providers

These are implemented boundaries, not a claim of formal certification or zero risk.

## Planned controls

Later phases, if pursued, still need:

- CSRF protection for state-changing endpoints
- ephemeral snapshot TTL cleanup, if snapshots are implemented
- continued log scrubbing and error sanitization reviews

## Logging rules

Logs must never contain:

- Gmail addresses
- OAuth tokens
- message IDs
- email subjects or bodies
- unsubscribe URLs
- raw headers

## Dependency and static checks

The project should continue running local dependency and lint checks as features are added. No third-party telemetry or hosted error collection is planned for v1.

## Disclosure posture

This file is a living engineering document, not a claim of independent audit or formal certification.