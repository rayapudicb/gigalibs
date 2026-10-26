# WI-OI-120cf: Mobile v1 BFF — the platform producer for GigaLibs Mobile sign-in, session and read-only windows

- **Status:** Built (module complete, 2026-10-26): deploy group 2 of the fixed sequence (AGENTS.md, "v1 BFF, mobile app
  logout, LAN profile", parallel to CMMS). First proof committed `25bed181` (owner "commit", 2026-10-22); module
  completion (permission vectors, minimum app version, cleanup, migration renamed to sort after the main line, the
  mobile team's connection guide) committed as the module-completion commit. Next: UAT deploy of group 2 by the owner
  from a release worktree, then the Security review on UAT (owner, 2026-10-22: review after UAT, non-blocking;
  request `.pi/handoff/REVIEW-REQUEST-WI-OI-120cf.md`). The app's own logout and LAN app profile are the mobile
  team's (their repository). Decisions: owner,
  2026-10-22: "lets start mobile", then "mobile defaults ok": a local-network HTTPS address, TOTP only, first proof
  only). Worktree `gigalibs-mobile-bff`, branch `feat/mobile-v1-bff` from the SPEED branch `dc99f1bb` (it carries the
  trial-workspace sign-in fix; UAT's release branch is built from it). The mobile team's contract
  (`packages/mobile-contracts/src/index.ts`, 768 lines) is read from their working copy (their repository has no
  commit yet); the platform mirrors its shapes and never edits it. Earlier: owner, 2026-10-21, "mobile after SPEED"
  (moves the mobile producer ahead of its plan v3 place, X7). Implementer: Claude Code.
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

## Owner decisions

1. **Order:** after the SPEED batch (owner, 2026-10-21).
2. **Device-reachable address:** a local-network HTTPS address with a locally trusted certificate, installed on the
   test phones (owner, 2026-10-22, "mobile defaults ok"). Built as slice 2 below.
3. **MFA for mobile:** TOTP only (owner, 2026-10-22). No email codes.

## Slice 1 design: identity and session (built 2026-10-22)

**Routes.** The web app serves `/mobile/v1/*` (`app/mobile/v1/[...path]/route.ts`, `lib/mobile-bff.ts`) and forwards
seven listed routes to the control plane's `/api/v1/mobile/*` (`packages/auth-nest/src/mobile/`): `POST auth/password`,
`POST auth/mfa/verify`, `POST auth/refresh`, `POST auth/logout` (204), `GET memberships`, `POST session/switch`,
`GET session`. Only the bearer, the installation, profile, version and correlation headers and `Idempotency-Key` are
forwarded: no cookie, no tenant header, no query. Every answer is `no-store`; every refusal is
`application/problem+json` with a mobile code; an unknown route, an upstream outside the contract, a timeout (10 s) or
an unreachable control plane become `MOBILE_NOT_FOUND`, `MOBILE_UNAVAILABLE` or `MOBILE_UPSTREAM_TIMEOUT`.

**One identity authority.** Mobile reuses the control plane's own checks, extracted without change of behaviour:
`AuthService.authenticatePassword` (the login lock and the constant-time unknown-account answer, now shared with the web
login) and `verifyTotpForSignIn` (the same TOTP lock, replay and attempt counting and audit as the web, tagged
`channel: MOBILE`). Membership, roles, scopes and the session context are `getSessionContext`, unchanged.

**Sessions.** A mobile sign-in is an ordinary row in `sessions`, so every existing revocation ends it too (logout,
password change or reset, member removal, SCIM, identity revocation, expiry sweep). Its web refresh column holds a
random `mobile:` value nobody has, so the web refresh can never use a mobile session (tested). Mobile-only facts are in
four new tables (forward migration `20261026100000_mobile_sessions`, no change to existing tables):
`mobile_sessions` (installation, app profile, refresh-token hash, revision), `mobile_retired_refresh_tokens`,
`mobile_mfa_challenges`, `mobile_switch_outcomes`. Secrets are stored as SHA-256 or sealed.

**Tokens.** The access token is an HS256 JWT signed with a key derived from `JWT_ACCESS_SECRET` for mobile only
(HMAC "gigalibs-mobile:access:v1"), with `aud` `gigalibs-mobile`, `iss`, the installation `ins`, the profile `prf`
and the binding `bnd`; it lives 10 minutes. A web token is refused by mobile and a mobile token by the web guard
(tested). Every request rechecks the session, user, installation and profile; a tenant-bound request also rechecks the
membership, the tenant (active or unexpired trial) and the tenant's MFA policy.

**MFA.** Asked once, at sign-in, when any workspace the user may enter enforces it (`security.enforceMfa`; an
unreadable policy counts as enforced). No token is issued before it: the answer is `mobile-mfa-challenge.v1`, a random
one-use id (stored hashed) bound to installation and profile, 5 minutes, 5 tries, spent when presented from another
installation. A user with no authenticator gets `MOBILE_MFA_ENROLLMENT_REQUIRED` (set it up on the web). **Differs
from the web, for the Security review:** the web clears MFA when a workspace is chosen and asks again; mobile verified
the person before any workspace and keeps it across a switch; a workspace that starts enforcing MFA after the sign-in
is entered only after signing in again.

**Workspaces.** One eligible membership binds at sign-in (`TENANT_BOUND`); several give `PRE_TENANT`, which may only
list memberships, switch, refresh and log out (`GET session` answers `MOBILE_SCOPE_DENIED`). A `selectionId` is the
session, membership, installation, profile and expiry sealed with AES-256-GCM (key derived for that purpose): opaque,
5 minutes, refused when changed or presented by another session. The switch rechecks membership and tenant in one
transaction, rotates the refresh token (the old one retired), moves the session, raises its revision, and stores the
outcome sealed for 5 minutes, so a retry with the same `Idempotency-Key` answers the same refresh token without
rotating twice; the same key for another choice is `MOBILE_IDEMPOTENCY_CONFLICT` (409); an expired choice is
`MOBILE_SELECTION_EXPIRED` (410). The bearer issued before the switch stops working.

**Refresh.** One use: the presented token is swapped for a new one atomically and retired. A retired token presented
again (reuse), or a token from another installation or profile, revokes the session. The app single-flights its
refresh (`mobile-auth/src/token-provider.ts`), so strict reuse detection does not end honest sessions. A suspended
membership or a closed tenant ends the session at refresh (`MOBILE_MEMBERSHIP_REVOKED`).

**Session v3.** Mapped from the web's session context: persona from `determinePersona` (the same six values),
entitlements, the member's organization and place scope, and each assignment separate with its own permissions and
scope (the member's own as `member:<membershipId>`, each role by its assignment id; a unit-scoped role with no tree in
force covers nothing and is left out). `sessionRevision` grows at each switch; `authorizationRevision` and
`configurationRevision` are content revisions (the app compares them for equality). A session the contract cannot carry
(more than 50 places, 21 assignments) is refused (`MOBILE_UNAVAILABLE`), never cut down. **`modules` is empty:** the
platform has no mobile module grants yet (capabilities, navigation order, presentation); the app shows only what it
compiles in without one. Module grants come with the windows and records card.

**Configuration.** `MOBILE_APP_PROFILES` on the API (comma-separated; compose passes it through, empty by default):
empty means mobile is off and every mobile request is refused (`MOBILE_CONTRACT_UNSUPPORTED`). For the pilot it is
`gigalibs-universal`. No other new setting.

**Problems** (platform catalogue, `packages/contracts/src/mobile/index.ts`): the mobile team's codes plus
`MOBILE_REQUEST_INVALID` 400, `MOBILE_MFA_ENROLLMENT_REQUIRED` 403, `MOBILE_NOT_FOUND` 404,
`MOBILE_IDEMPOTENCY_CONFLICT` 409, `MOBILE_SELECTION_EXPIRED` 410, `MOBILE_UNAVAILABLE` 503. A wrong password and an
unknown account answer the same (`MOBILE_INVALID_CREDENTIALS`); a lock is `MOBILE_ACCOUNT_LOCKED` 423.

## Slice 2: the local-network HTTPS address (built 2026-10-22)

`infra/compose/compose.mobile-lan.yaml`, its own Compose project `gigalibs-mobile-lan`: one TLS proxy
(`infra/compose/mobile-lan/proxy.mjs`, plain Node on the build's own pinned `node:24-bookworm-slim` image, no new
download) that joins the UAT network and forwards **only** `GET`/`POST /mobile/v1/<path>` to UAT's `web` service. Every
other path (the admin site included), method, dot or encoded segment, and any body over 64 KB is refused at the proxy
(`MOBILE_NOT_FOUND`, `MOBILE_REQUEST_INVALID`) and never reaches the web app; only the mobile headers are forwarded
(no cookie, no tenant or forwarding header) and only `content-type`/`content-length` come back, with `no-store`,
`nosniff` and HSTS. It publishes on the Mac's network address only (`MOBILE_LAN_ADDRESS`, port 8443), runs as an
unprivileged user on a read-only filesystem with no capabilities, 128 MB, and holds nothing but its TLS key. Stopping it
ends phone access; UAT is unaffected.

`scripts/mobile-lan-certificate.sh <dir outside the repo> <address> [<name>.local]` creates once a local certificate
authority (P-256, 3 years) and issues a server certificate for the address and `.local` name (P-256, 397 days,
`serverAuth`); keys stay in that directory, never printed. Re-running keeps the authority (phones keep trusting it) and
reissues the server certificate, e.g. when the address changes. The phones install `ca.crt` (or `ca.cer`) and trust it;
the script prints its SHA-256 fingerprint to check on each phone. **For the mobile team:** an Android build only trusts a
user-installed authority when its network security configuration allows user certificates for that build; iOS needs
"full trust" switched on for the installed profile.

### Evidence (2026-10-22)

- Unit: tokens and sealed values 7, session v3 projection 5, contract fixtures 5 (the mobile client's own v3
  fixture parses), web front door 6, LAN proxy over real TLS 5.
- Flows on PostgreSQL 16 with every migration applied (local `mobile_bff_proof` database, container
  `mobile120cf-proof`, kept): 13 tests — wrong password, unknown account and lock answer alike; profile, version,
  installation and extra-field refusals; one workspace binds; none refused; pre-tenant kept out of the session; two
  workspaces chosen with an idempotent switch, conflict on another choice, expired choice, forged choice; the old bearer
  stops after a switch; another installation refused; refresh rotation and reuse revoking the session; refresh from
  another installation revoking it; the web refresh refusing a mobile refresh token; MFA challenge with no token, wrong
  code, right code, spent challenge, challenge from another installation; logout; suspended membership; a web password
  change ending the mobile session. Stored effects checked: 5 sessions revoked, each refusal audited, TOTP audits
  tagged `MOBILE`.
- Over HTTP through the API's real pipeline (`api/v1` prefix, the web JWT guard, tenant boundary, RBAC, the API's
  exception filter): 4 tests — sign-in past the web guards, problems with their own status and correlation id, the web
  refusing a mobile bearer and mobile refusing a web bearer, switch and logout (204).
- The migration and the Prisma schema agree (no drift for the four tables); data portability, layer map and the
  deployment profile classify the new tables and setting.
- Container smoke (throwaway network, stand-in web app, loopback port): the pinned image, unprivileged user and
  read-only mounts start; TLS verifies for 192.168.31.102 against the local authority; cookies are stripped both ways;
  `/` answers 404; a client without the authority is refused.
- `pnpm verify` (2026-10-22): build and every audit pass (layers, deployment profile, API boundary, production data,
  SDLC, migration pins) except module conversions; tests 3346 passed, 1 failed, 2 files not loaded. All three failures
  predate this branch and are identical on the unchanged SPEED worktree `dc99f1bb`: Finance record adapters and module conversions (`finance-product-standard-costs`, from
  `b85a4244`, WI-OI-120bq); two API specs that need `CONTROL_PAYLOAD_KEY_VERSION` from a `.env` this worktree lacks.

## Slice 3: module completion (built 2026-10-26)

- **Permission conformance:** the mobile team's `mobile-permission-conformance-v1.json` (copied unchanged into
  `packages/contracts/src/mobile/`) runs against the platform's `holdsPermission`: all 12 vectors agree.
- **Minimum app version:** `MOBILE_MIN_APP_VERSION` (optional; compose, deployment profile and `.env.example` declare
  it). When set, every route but logout refuses an app below it, or one that does not send
  `X-Gigalibs-App-Version`, with `426 MOBILE_CONTRACT_UNSUPPORTED`. A pre-release counts below its release.
- **Cleanup:** `pruneMobileAuthState` (auth-nest), run by the data-retention worker after the login-throttle pruning:
  MFA challenges an hour past expiry, switch outcomes past expiry, and retired refresh-token hashes of ended sessions
  or older than the refresh lifetime. Sessions and the audit log stay.
- **Migration order:** renamed `20261022000000_mobile_sessions` → `20261026100000_mobile_sessions` (deployed nowhere)
  so it sorts after the main line's latest (`20261026030000_platform_reference_data`). Applying the mobile commits onto
  the main line (`git merge-tree`, base `dc99f1bb`) conflicts only in `packages/contracts/src/index.ts` (both append an
  export).
- **Connection guide for the mobile team:** `docs/mobile/MOBILE_V1_CONNECT.md` on the branch: origin, certificate
  trust (iOS and Android), app profile, headers, routes, behaviour, problem codes, what is not served.
- **Evidence:** 62 mobile tests pass (unit 38, flows on PostgreSQL 15, over HTTP 4, LAN proxy 5) on a fresh
  `mobile_bff_proof` database migrated from scratch with no drift; the earlier run's data is kept as
  `mobile_bff_proof_run_20261022` in the same container.

### Not built (recorded)

- `issuerId` and `membershipId` in the token response: needs a new token contract version from the mobile team.
- Maintenance answers (no public bootstrap is served; the app's entry is build-owned).
- Mobile logout and the LAN app profile in the app: the mobile team's repository.
- Windows, records, lookups and module grants: the second card.

## Scope when started (first proof only)

Sign-in, MFA (TOTP), memberships, switch, session v3, refresh with reuse detection, logout; mobile audience, issuer
and installation binding; `application/problem+json` errors without account enumeration; shared contract artifact and
the permission conformance vectors run against `holdsPermission`. Windows and records follow in a second card. Exit:
the mobile team's M2 and M6 checks on a signed iOS and Android build against the deployed BFF.

## Also reported by the mobile team

`cmms-work-orders.window.json` names `technician-ref` without declaring it (the same CMMS defect that stopped window
activation on UAT in WI-OI-120cd); the fix belongs to CMMS (Cursor's track).
