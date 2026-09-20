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

At the current stage, the application aims to:

- use cryptographically random opaque session identifiers
- keep session cookies `HttpOnly` and `SameSite=Lax`
- mark cookies `Secure` in production
- validate OAuth `state`
- avoid browser-accessible token storage
- avoid third-party analytics and error-reporting providers

## Planned controls

Later phases must add and test:

- CSRF protection for state-changing endpoints
- Gmail token confinement to server memory
- ephemeral snapshot TTL cleanup
- SSRF protections for unsubscribe fallback
- redirect target validation
- quota-aware retry and backoff logic
- log scrubbing and error sanitization

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