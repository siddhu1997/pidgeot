# Development Guide

## Requirements

- Node.js compatible with Next.js 16
- npm
- Google Cloud project for OAuth testing
- `cloudflared` for HTTPS callback testing

## Install

```bash
npm install
cp .env.example .env.local
```

## Run locally

```bash
npm run dev
```

## Lint, test, and build

```bash
npm run lint
npm run test
npm run build
```

If zsh autocorrect interferes with `npm run test`, run:

```bash
nocorrect npm run test
```

## Cloudflare Tunnel flow

Recommended local OAuth workflow:

1. Start the app locally.
2. Start a Cloudflare Tunnel that forwards to the local port.
3. Set `GOOGLE_REDIRECT_URI` to the public HTTPS callback URL.
4. Update the Google OAuth client configuration to match the tunnel callback.
5. Test login through the public HTTPS URL.

Quick Tunnels are acceptable for temporary development but should not be treated as a production design decision.

## Development Lab

`/playground` is the Development Lab in development mode. Production builds render the route as unavailable, and every `/api/dev-lab/*` handler independently rejects production requests with a 404.

Mutating Lab actions (mail generation, execution-mode changes, and workflow-scenario apply/clear/reset) require an authenticated Pidgeot session. They do not require Gmail-ready authorization unless the specific action already needs Gmail. Scenario clear/reset refuse a scenario owned by another session.

This infrastructure can send real mail to a configured test inbox. It is development-only. Do not enable it in production. Do not treat the Lab as production functionality.

### Configure the development mail sender

Add these server-only variables to `.env.local`. Do not put SMTP credentials in client code, cookies, or logs. Copy the keys from `.env.example` and fill only the local file.

```bash
DEV_MAIL_ENABLED=true
DEV_MAIL_RECIPIENT=your-test-inbox@gmail.com
DEV_MAIL_FROM_DOMAIN=pidgeot-dev.siddharths.co.in
DEV_MAIL_BREVO_SMTP_HOST=smtp-relay.brevo.com
DEV_MAIL_BREVO_SMTP_PORT=587
DEV_MAIL_BREVO_SMTP_USER=
DEV_MAIL_BREVO_SMTP_PASSWORD=
DEV_MAIL_MAILGUN_SMTP_HOST=smtp.eu.mailgun.org
DEV_MAIL_MAILGUN_SMTP_PORT=587
DEV_MAIL_MAILGUN_SMTP_USER=
DEV_MAIL_MAILGUN_SMTP_PASSWORD=
DEV_MAIL_UNSUBSCRIBE_BASE_URL=https://timmy-sclerenchymatous-unfanatically.ngrok-free.dev
DEV_MAIL_MAX_MESSAGES_PER_GENERATION=50
DEV_MAIL_MAX_SEND_CONCURRENCY=3
DEV_MAIL_MAX_SEND_ATTEMPTS=2
```

The recipient is always taken from `DEV_MAIL_RECIPIENT`. The browser cannot supply an address.

Delivery goes through the development mail adapter: Brevo first, then Mailgun only for confirmed transient provider failures. Permanent errors (auth, invalid sender, invalid recipient, 5xx) are not failed over. Ambiguous timeouts after DATA are not retried, to avoid duplicates.

Generated From addresses use `DEV_MAIL_FROM_DOMAIN`. That domain must be authenticated with Brevo and Mailgun so Gmail keeps distinct sender identities.

HTTPS unsubscribe headers use `DEV_MAIL_UNSUBSCRIBE_BASE_URL`, never localhost. The production unsubscribe resolver still classifies those URLs normally.

### Start the lab

```bash
npm run dev
```

Open [http://localhost:3000/playground](http://localhost:3000/playground).

### Generate a dataset

1. Set sender count, messages per sender, unread ratio, unsubscribe profile, category profile, and seed.
2. Click **Generate promotional mail**.
3. The lab reports how many messages were submitted to SMTP. That is not proof Gmail received them.
4. Open the configured test inbox, then run a normal Pidgeot scan from `/`.

### Hard limits

- max 10 unique senders
- max 10 messages per sender
- max 50 messages total (`DEV_MAIL_MAX_MESSAGES_PER_GENERATION`)
- max send concurrency 3
- max send attempts 2 (primary plus one failover)
- seed `1`–`999999`

These limits are enforced server-side.

### Development unsubscribe endpoint

Generated RFC8058 and HTTPS-manual messages point at:

`${DEV_MAIL_UNSUBSCRIBE_BASE_URL}/api/dev-lab/unsubscribe?token=…`

The handler exists only in development. It accepts a generated opaque token, records a process-local hit, and does nothing else. It is not a generic HTTP proxy, does not accept target URLs, and does not call third-party unsubscribe services.

The existing production unsubscribe resolver still processes the URL when Pidgeot scans the Gmail message. There is no localhost allowlist and no development SSRF bypass.

### Warning

This lab delivers real email. Keep `DEV_MAIL_ENABLED` off unless you intend to send mail to the configured test inbox. Never commit SMTP passwords.

## Current limitations

- Gmail scanning, sender grouping, classification, unsubscribe execution, and Trash cleanup are process-local and request-driven. They are not backed by durable storage or workers.
- Development may simulate workflow execution. Production requires an explicit `DEV_SIMULATE_WORKFLOW_EXECUTION` value and does not silently default to simulation.
- 24-hour cleanup snapshots are not implemented. A process restart clears in-memory auth, scan, and workflow state.
- Process-local state means auth and scan state are not designed for horizontal scaling in v1.