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

## Current limitations

- Gmail scanning is process-local and request-driven in Phase 2B; it is not backed by durable storage or workers.
- Sender grouping, classification, and unsubscribe-mechanism resolution are process-local and derived from scan results in Phase 3A, Phase 3B, and Phase 4A.
- Cleanup and unsubscribe execution are not yet implemented.
- Process-local state means auth and scan state are not designed for horizontal scaling in v1.