# Privacy Policy Draft

Pidgeot is an open-source Gmail cleanup application being built with privacy as a first-class engineering requirement.

## What Google data the application accesses

The full application is intended to access Google account identity and the Gmail mailbox data required to:

- authenticate the user with Google OAuth
- identify recurring senders
- inspect unsubscribe metadata
- move user-selected unread messages to Gmail Trash

The current implementation stage does not yet scan or mutate Gmail mailboxes.

## Why this data is accessed

The application exists to help the user review unwanted recurring senders and explicitly choose cleanup actions. The app does not decide on behalf of the user.

## What is processed

The long-term design processes mailbox metadata and derived sender-group signals needed for classification and cleanup. The project is explicitly designed to avoid persistent storage of raw email content.

## Temporary retention

When ephemeral snapshot support is implemented, the application will temporarily retain the minimum data required to restore progress for up to 24 hours. After expiration, the snapshot must be deleted.

## What is not stored

The intended architecture forbids persistent storage of:

- Gmail passwords
- OAuth tokens in databases, filesystem storage, browser localStorage, or browser sessionStorage
- email bodies
- email subjects
- raw full headers
- attachments
- persistent user profiles for mailbox history

## What is never sold or used for advertising

Pidgeot is not designed to sell user data, build advertising profiles, or use mailbox data for marketing.

## External services that may receive data

The only external services intended to receive data during normal operation are:

1. Google OAuth
2. Gmail API
3. a user-selected unsubscribe endpoint

No Gmail content is intended to be sent to LLM providers, analytics systems, advertising systems, or unrelated third-party APIs.

## Open source transparency

The source code is part of the privacy model. Users should be able to inspect the repository to understand exactly how Gmail data is handled.

## Revoking access

Users can revoke Google access through their Google account permissions page. The future README and OAuth docs will include the exact flow.

## Status

This document is a project policy draft aligned with the implementation spec. It is not a claim that every later-phase behavior is already live today.