# Security review request: WI-OI-120cf, mobile v1 BFF (first proof)

- **Branch:** `feat/mobile-v1-bff` at `25bed181` (worktree `gigalibs-mobile-bff`), one commit on top of the SPEED commit
  `dc99f1bb` that UAT's pending release `a1eb8242` is built from. Review `dc99f1bb..25bed181` (30 files).
- **Why a review:** plan v3 rule 2. It adds a second way to sign in (bearer tokens for a native app), a forward
  migration in the control-plane database, refresh-token rotation with revocation, and a proxy that exposes part of UAT
  to the local network.
- **Author:** Claude Code (this session). The reviewer must be someone else; record the reviewer's name in
  `.pi/tasks/WI-OI-120cf.md`.
- **Owner decisions behind it:** mobile after SPEED (2026-10-21); a local-network HTTPS address with a locally trusted
  certificate, TOTP only, first proof only (2026-10-22). The contract is the mobile team's candidate
  (`gigalibs_mobile/packages/mobile-contracts`), mirrored in `packages/contracts/src/mobile/index.ts`.

## What to look at

1. **Shared identity code** (`packages/auth-nest/src/auth.service.ts`): `login` now calls the extracted
   `authenticatePassword` (lock, constant-time unknown account, failure counting unchanged), and `verifyTotp` calls the
   extracted `consumeTotpCode` (row lock, replay, attempts, lock and audit unchanged; the session update stays in
   `verifyTotp`). Please confirm the web behaviour is unchanged. `verifyTotpForSignIn` is new: it accepts only an
   enrolled authenticator and runs the caller's session creation in the same transaction.
2. **Token separation** (`packages/auth-nest/src/mobile/mobile-credentials.ts`): mobile access tokens are HS256 under a
   key derived from `JWT_ACCESS_SECRET` (HMAC with "gigalibs-mobile:access:v1"), with `aud`, `iss`, installation,
   profile and binding claims, 10 minutes. The web guard verifies with the root secret, so it refuses them; mobile
   refuses web tokens. Is deriving from the same root secret acceptable, or should mobile have its own secret?
3. **Sessions** (`mobile-auth.service.ts`, migration `20261022000000_mobile_sessions`): a mobile sign-in is a
   `sessions` row (so logout, password change and reset, member removal, SCIM, identity revocation and the sweep end
   it); its `refreshToken` column holds `mobile:<random>`, so the web `POST /auth/refresh` can never use it; the
   rotating refresh hash lives in `mobile_sessions`. Every request rechecks session, user, installation and profile;
   tenant-bound requests also recheck membership, tenant status and the tenant's MFA policy.
4. **MFA differs from the web.** Mobile asks for TOTP once, at sign-in, when any workspace the user may enter enforces
   it (an unreadable policy counts as enforced), and keeps it across a workspace switch; the web clears it on every
   switch and asks again. A workspace that starts enforcing MFA after the sign-in is entered only after signing in
   again. The challenge is random, stored hashed, one use, 5 minutes, 5 tries, bound to installation and profile and
   spent when presented elsewhere. Please confirm this is acceptable.
5. **Workspace choices and the switch:** `selectionId` is AES-256-GCM-sealed (session, membership, installation,
   profile, expiry; key derived for that purpose); the switch rechecks membership and tenant in one transaction, rotates
   the refresh token and stores the new one sealed for 5 minutes in `mobile_switch_outcomes` so a retry with the same
   `Idempotency-Key` answers the same token. Is keeping a sealed refresh token for 5 minutes acceptable?
6. **Refresh reuse:** a retired refresh token presented again, or a token from another installation or profile,
   revokes the session (strict; the app single-flights its refresh). Retired hashes are kept with the session
   (no sweep yet).
7. **The front door** (`apps/workflow-platform/lib/mobile-bff.ts`, `app/mobile/v1/[...path]/route.ts`): seven listed
   routes; only the bearer, installation, profile, version and correlation headers and `Idempotency-Key` are
   forwarded; no cookie, tenant header or query; non-problem upstream answers become generic mobile problems.
8. **The local-network proxy** (`infra/compose/compose.mobile-lan.yaml`, `infra/compose/mobile-lan/proxy.mjs`,
   `scripts/mobile-lan-certificate.sh`): only `GET`/`POST /mobile/v1/<letters, digits, / _ ->`; dot and encoded
   segments refused; 64 KB body limit; TLS 1.2+; HSTS, nosniff, no-store; unprivileged, read-only, no capabilities;
   published on the Mac's network address only. The local CA key stays in the owner's certificate directory. It exposes
   UAT's sign-in to anyone on the same Wi-Fi: password lock and TOTP are the protection. Please confirm.
9. **Enumeration:** a wrong password and an unknown account answer the same (`MOBILE_INVALID_CREDENTIALS`); the
   "no workspace" and "set up an authenticator" answers come only after a correct password.

## Evidence

- Unit 28; flows on PostgreSQL 16 with every migration applied 13; over the API's real HTTP pipeline (prefix, web
  guard, tenant boundary, RBAC, exception filter) 4; LAN proxy over real TLS 5; container smoke on a throwaway network.
  Details: `.pi/tasks/WI-OI-120cf.md`, "Evidence".
- `pnpm verify`: 3346 passed; three failures predate the branch (finance from `b85a4244`; two specs needing a `.env`).

## Not in this change

The minimum app-version check, `issuerId`/`membershipId` in the token response (needs a new contract version from the
mobile team), mobile module grants (`modules` is empty), windows and records (next card).
