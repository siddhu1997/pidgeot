# Google Verification Preparation

This document is a preparation checklist, not a claim that verification is complete.

## Project owner checklist

1. Create a dedicated Google Cloud project for development.
2. Enable the Gmail API for that project when Gmail access is actually implemented.
3. Configure the Google Auth Platform and consent screen.
4. Set branding, authorized domains, and support email.
5. Add only the exact OAuth scopes used by the current release.
6. Add test users during development.
7. Create a web OAuth client.
8. Configure the exact redirect URIs for development and production.
9. Create a separate staging or production project as needed.
10. Prepare a privacy policy URL.
11. Prepare terms if required for the deployment context.
12. Record scope justification with plain-language explanations.
13. Prepare reviewer instructions.
14. Prepare a demo video showing the consent flow and user-directed behavior.
15. Assess whether restricted-scope review or annual reassessment applies for the released scope set.

## Scope justification direction

Current phase:

- identity-only scopes for Google authentication

Later Gmail cleanup release:

- explain that Gmail access is needed to discover recurring senders, inspect unsubscribe metadata, and move user-selected unread messages to Trash
- explain that send, settings, Drive, Calendar, and unrelated scopes are not required

## Reviewer expectations

The repository should remain understandable enough that a reviewer can confirm:

- no persistent Gmail content storage
- no analytics leakage
- no third-party LLM processing
- explicit user control over cleanup actions