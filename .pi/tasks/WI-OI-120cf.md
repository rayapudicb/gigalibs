# WI-OI-120cf: Mobile v1 BFF — the platform producer for GigaLibs Mobile sign-in, session and read-only windows

- **Status:** Approved, next after the SPEED batch (WI-OI-120ce). Owner, 2026-10-21: "mobile after SPEED" (moves the
  mobile producer ahead of its plan v3 place, X7). Recommended and to confirm when it starts: a local-network HTTPS
  address with a locally trusted certificate, TOTP only, first proof only. Implementer: Claude Code.
- **Asked by:** the mobile team (`/Users/rayapudi/dev/gigalibs_mobile`,
  `docs/architecture/MOBILE_V1_PLATFORM_WORK_ITEMS.md`, 2026-10-21), relayed by the owner.
- **Rule it follows:** plan v3 rule 6 (access checked in one place): a mobile BFF beside the web BFF, reusing the
  control plane's identity, membership and authorization and the signed `PlatformContextV1` path to modules.

## What the platform already has (read 2026-10-21, `packages/auth-nest`)

| Mobile route | Existing control-plane capability | Gap the BFF or auth must close |
| --- | --- | --- |
| `POST /mobile/v1/auth/password` | `POST /api/v1/auth/login`: JSON bearer tokens (not cookies), constant-time unknown-account answer, login lock (429 `LOGIN_LOCKED`), `requiresMfa` | The platform issues an MFA-pending token; mobile wants **no token before MFA**: the BFF keeps the pending session server-side behind a one-use `challengeId` bound to installation and profile |
| `POST /mobile/v1/auth/mfa/verify` | `POST /auth/mfa/totp/verify`, recovery codes | TOTP only; there is no `EMAIL_OTP` method; challenge expiry, rate limit and one-time use belong to the BFF |
| `GET /mobile/v1/memberships`, `POST …/session/switch` | `GET /tenants`, `POST /auth/select-tenant` (one eligible membership binds automatically at login) | Opaque short-lived `selectionId`s; idempotency key; no tenant id from the caller |
| `GET /mobile/v1/session` (`mobile-session.v3`) | `GET /auth/context`: user, tenant, entitlements, roles, permissions, role assignments with scope (WI-OI-120w), organization scope | Mapping to v3 with revisions (authorization, configuration, tree) |
| `POST /mobile/v1/auth/refresh` | `POST /auth/refresh`: one-use rotation (old hash no longer matches) | No refresh-family **reuse detection** (a reused token fails but does not revoke the family) |
| `POST /mobile/v1/auth/logout` | `POST /auth/logout` revokes the session | — |
| Tokens | HS256 JWT `sub`, `tid`, `sid`, `roles` | No `aud` or `iss`: a mobile audience and issuer, installation and app-profile binding on the session, and the `issuerId` / `membershipId` binding the mobile team asks for |
| `GET /mobile/v1/windows/…`, `records/…`, `lookups/…` | Web BFF: `/api/control/configuration/runtime/manifest/current`, module gateways with signed context | Read-only proxy with the same checks; lookup and write contracts still to agree |

## Owner decisions this card needs

1. **Order:** decided, after the SPEED batch (owner, 2026-10-21).
2. **A device-reachable HTTPS address:** UAT listens on `127.0.0.1:5180` on the owner's machine; a phone cannot reach
   it. Either a LAN address with a locally trusted certificate (phones on the same network; the certificate installed
   on the test phones) or a tunnel through an external provider (exposes UAT publicly: a security decision and a
   Security review).
3. **MFA methods for mobile:** TOTP only (what exists), or add email one-time codes (new platform work).

## Scope when started (first proof only)

Sign-in, MFA (TOTP), memberships, switch, session v3, refresh with reuse detection, logout; mobile audience, issuer
and installation binding; `application/problem+json` errors without account enumeration; shared contract artifact and
the permission conformance vectors run against `holdsPermission`. Windows and records follow in a second card. Exit:
the mobile team's M2 and M6 checks on a signed iOS and Android build against the deployed BFF.

## Also reported by the mobile team

`cmms-work-orders.window.json` names `technician-ref` without declaring it (the same CMMS defect that stopped window
activation on UAT in WI-OI-120cd); the fix belongs to CMMS (Cursor's track).
