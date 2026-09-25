# Privacy Policy Draft

Pidgeot is an open-source Gmail cleanup application being built with privacy as a first-class engineering requirement.

## What Google data the application accesses

The application accesses Google account identity and the Gmail mailbox data required to:

- authenticate the user with Google OAuth
- identify recurring senders from Gmail metadata
- inspect unsubscribe metadata
- move user-selected unread messages to Gmail Trash

Identity sign-in requests `openid` and `email`. Gmail access is a separate user-enabled flow that requests `https://www.googleapis.com/auth/gmail.modify`. The implemented Gmail methods are `messages.list`, metadata-only `messages.get`, and `messages.trash`.

Gmail access is through Google OAuth. The application does not see or store the user's Google password.

## Why this data is accessed

The application exists to help the user review unwanted recurring senders and explicitly choose cleanup actions. The app does not decide on behalf of the user.

## What is processed

The application processes mailbox metadata and derived sender-group signals needed for classification and cleanup. There is no application persistence layer, so raw email content is not stored in a database, Redis, filesystem store, or similar.

Process-local in-memory session, scan, and workflow state exists only for the lifetime of the server process. A restart clears it.

## Temporary retention

Ephemeral 24-hour cleanup snapshots are not implemented. When that support is added, the application will temporarily retain the minimum data required to restore progress for up to 24 hours. After expiration, the snapshot must be deleted. Do not treat snapshot restoration as a current production feature.

## What is not stored

The current architecture does not persist:

- Gmail passwords
- OAuth tokens in databases, Redis, filesystem storage, cookies, browser localStorage, or browser sessionStorage
- email bodies
- email subjects
- snippets
- raw full headers
- attachments
- persistent user profiles for mailbox history

## What is never sold or used for advertising

Pidgeot is not designed to sell user data, build advertising profiles, or use mailbox data for marketing.

## External services that may receive data

The external services that may receive data during normal operation are:

1. Google OAuth
2. Gmail API
3. an unsubscribe destination specified by the email, when the user runs an automatic unsubscribe

An automatic unsubscribe request being submitted or completed does not guarantee that the sender will never send mail again.

No Gmail content is sent to LLM providers, analytics systems, advertising systems, error-reporting services, or unrelated third-party APIs. No third-party analytics, tracking, or error-reporting service is part of the application architecture.

## Open source transparency

The source code is part of the privacy model. Users should be able to inspect the repository to understand exactly how Gmail data is handled.

## Revoking access

Users can revoke Google access through their Google account permissions page. Application logout invalidates Pidgeot sessions for that account; it does not revoke the Google OAuth grant.

## Status

This document is a project policy draft aligned with the current implementation. Later-phase snapshot behavior is described above as planned, not as a live feature.