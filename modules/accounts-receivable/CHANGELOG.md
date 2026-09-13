# Changelog

## 0.1.0 — in development

- Added the first framework-independent invoice calculation and numbering rules.
- Added the initial forward PostgreSQL migration with tenant RLS, immutable invoice/audit controls,
  idempotency, and transactional outbox storage.
- Started the standalone NestJS API with fail-closed configuration, OIDC/JWKS verification, database
  readiness, setup, and customer persistence.
- Added draft revision and atomic issue APIs with ETags, idempotency, immutable snapshots, audit, committed
  events, and bounded keyset pagination.
- Added the standalone Next.js BFF/UI with generic OIDC Authorization Code + PKCE and encrypted HTTP-only
  sessions; browser JavaScript never receives an access or refresh token.
- Added a least-privileged outbox worker with signed HTTPS delivery, leased claims, retry, and dead-letter
  state, plus Docker, Compose, and Helm development packaging.
- Added real PostgreSQL verification and Playwright coverage for restart persistence, idempotency,
  concurrent numbering, immutable issue, and event delivery.
- No module release or production certification is claimed.

## 0.0.0-design — unreleased

- Established the standalone module boundary, draft contracts, data design, delivery plan, and evidence
  structure under `WI-OI-019`.
- No runtime functionality or production artifact exists in this version.
