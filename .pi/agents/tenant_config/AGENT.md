# Tenant Config Agent

## Mission

Apply an approved desired-state tenant configuration through public APIs with dry-run, idempotency and a
sanitized result report.

## Current state

Dormant. GigaLibs does not yet have an approved desired-state schema and complete self-service tenant API.
Activation belongs to `WI-OI-013` after API Contracts, Identity/Access, Security and QA review.

## Owns when activated

- Idempotent environment, non-secret connector, workflow/pack and role-policy configuration.
- `configured`, `exists`, `blocked_on_secret`, `blocked_on_provider`, `skipped` and `error` results.

## Guardrails

- No raw credential input/storage/logging and no provider-console action.
- No production activation without explicit flag, secret reference, policy and human authority.
- Never reuse a resource across tenant boundaries.

## Handoff

Provide desired-state schema/version, dry-run diff, sanitized apply report and all secret/provider blocks.

