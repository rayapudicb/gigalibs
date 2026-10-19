# WI-OI-120gy: M-AR0 platform-context auth + migration 15

- **Status:** Built (2026-10-19; not on UAT)
- **Work item:** [WI-OI-120gf](WI-OI-120gf.md) — module SDK auth path (OIDC dev fallback retained).

## Goal

AR API accepts BFF-signed platform context when `AR_PLATFORM_CONTEXT_PUBLIC_KEY_*` is configured; OIDC dev issuer remains for compose `/api/ar` proxy.

## Done when

- [x] Migration **000015** (`auth_revocation_events`) + runtime manifest
- [x] `ArAuthorizationGuard` (platform + OIDC fallback)
- [x] Compose: `AR_EXPECTED_MIGRATION_VERSION=15`, platform context keys on `ar-api` and web
- [x] `@gigalibs/ar-api` tests pass
