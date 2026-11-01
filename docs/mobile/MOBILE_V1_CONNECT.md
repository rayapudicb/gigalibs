# Connecting GigaLibs Mobile to the platform's `/mobile/v1`

For the mobile team (WI-OI-120cf, platform branch `feat/mobile-v1-bff`). This is what the platform serves for the
pilot, how a test phone reaches it, and where it differs from the candidate contract in
`gigalibs_mobile/packages/mobile-contracts`. The platform's copy of that contract is
`packages/contracts/src/mobile/index.ts`; its tests parse your client's own session v3 fixture and run your
`mobile-permission-conformance-v1.json` vectors against the server's `holdsPermission` (all 12 agree).

## Reaching it

| | |
| --- | --- |
| Origin (pilot) | `https://<the platform Mac's network address>:8443`, e.g. `https://192.168.31.102:8443`. Only phones on the same Wi-Fi reach it; it is not on the internet. |
| What answers there | Only `GET`/`POST /mobile/v1/*`. Every other path, including the admin site, answers `404 MOBILE_NOT_FOUND`. |
| TLS | A certificate from the pilot's local certificate authority. Install `ca.cer` (sent separately; check its SHA-256 fingerprint with the platform owner). **iOS:** install the profile, then Settings → General → About → Certificate Trust Settings → full trust. **Android:** the build must trust user-installed authorities (a debug/internal `network_security_config` with `<certificates src="user"/>`); a release build that trusts only system authorities will refuse it. |
| App profile | `gigalibs-universal`. Set its API origin to the address above. The server serves only the profiles it is configured with (`MOBILE_APP_PROFILES`); another profile answers `426 MOBILE_CONTRACT_UNSUPPORTED`. |
| Accounts | Real platform accounts with an active workspace membership. Never put a password in configuration, fixtures or logs. If a workspace the account can enter requires MFA, the account must have set up an authenticator on the web first. |

If the Mac's network address changes, the server certificate is reissued for the new address (the authority stays,
so phones keep trusting it) and the app profile's origin changes with it.

## Every request

- `X-Gigalibs-Installation-Id`: the installation's UUID. Required on every route; tokens are bound to it.
- `X-Gigalibs-App-Version`: `major.minor.patch`. When the platform sets a minimum (`MOBILE_MIN_APP_VERSION`), an older
  or missing version answers `426 MOBILE_CONTRACT_UNSUPPORTED` on every route except logout.
- `X-Correlation-Id` (optional, 8–128 of `A-Za-z0-9._-`): echoed as `correlationId` in a problem.
- `Authorization: Bearer <accessToken>` on memberships, switch, session and logout.
- Never a tenant header or tenant query: they are dropped.

Every answer is `Cache-Control: no-store`. Every refusal is `application/problem+json`
`{type, title, status, code[, correlationId]}`.

## Routes

| Route | Body | Answer |
| --- | --- | --- |
| `POST /mobile/v1/auth/password` | `mobile-password-sign-in.v1` | `mobile-token-set.v2` (`TENANT_BOUND` with one workspace, `PRE_TENANT` with several) **or** `mobile-mfa-challenge.v1` (method `TOTP`, no token) |
| `POST /mobile/v1/auth/mfa/verify` | `mobile-mfa-verification.v1` | `mobile-token-set.v2` |
| `GET /mobile/v1/memberships` | — | `mobile-membership-page.v1` (≤ 50, choices valid 5 minutes) |
| `POST /mobile/v1/session/switch` | `mobile-membership-selection.v1`, plus the same UUID in `Idempotency-Key` | `mobile-token-set.v2` `TENANT_BOUND` |
| `GET /mobile/v1/session` | — | `mobile-session.v3` (tenant-bound bearer only) |
| `POST /mobile/v1/auth/refresh` | `mobile-refresh-token.v1` | `mobile-token-set.v2` (rotated) |
| `POST /mobile/v1/auth/logout` | `{"contractVersion":"mobile-logout.v1"}` | `204` |

## Behaviour to build against

- **Access tokens live 10 minutes.** Refresh is one use: send each refresh token once, and single-flight refresh
  (your `token-provider.ts` does). A refresh token presented a second time, or from another installation or profile,
  **ends the session**; the app must sign in again.
- **MFA** is asked once, at sign-in, when any workspace the account may enter requires it; it carries across a
  switch. A challenge lasts 5 minutes and allows 5 codes; a challenge used from another installation is spent. If a
  workspace starts requiring MFA after sign-in, switching into it (or refreshing in it) answers
  `401 MOBILE_AUTH_REQUIRED`: sign in again.
- **Switch:** retry with the **same** `idempotencyKey` after a lost answer; you get the same refresh token. Do **not**
  refresh with the pre-switch refresh token after a switch was sent: it was retired, and presenting it ends the
  session. After a switch the previous bearer no longer works.
- **`PRE_TENANT`** bearers may list memberships, switch, refresh and log out; `GET /session` answers
  `403 MOBILE_SCOPE_DENIED`.
- **Session v3:** `persona`, `entitlements`, member organization and place scope, and every assignment separate with
  its own permissions and scope (`member:<membershipId>` for the member's own, role assignment ids otherwise).
  `sessionRevision` grows at each switch; `authorizationRevision` and `configurationRevision` change whenever
  authority or configuration does (compare for equality). **`modules` is empty** until the platform publishes
  mobile module grants (next card): show only what the binary compiles in without a grant (Home, Profile).
- Logout, a password change or reset on the web, a suspended membership or a closed workspace end the mobile session.

## Problem codes

Your suggested catalogue, plus six the platform adds:

| Code | Status | When |
| --- | --- | --- |
| `MOBILE_REQUEST_INVALID` | 400 | Body or header outside its contract (extra field, missing installation id, mismatched `Idempotency-Key`, body over 64 KB) |
| `MOBILE_INVALID_CREDENTIALS` | 401 | Wrong email or password, or no such account (the same answer) |
| `MOBILE_MFA_INVALID` | 401 | Wrong or reused code |
| `MOBILE_AUTH_REQUIRED` | 401 | No, expired, revoked or stale bearer or refresh token: sign in again |
| `MOBILE_MFA_ENROLLMENT_REQUIRED` | 403 | The account must set up an authenticator on the web first |
| `MOBILE_MEMBERSHIP_NONE` | 403 | No workspace this account can use |
| `MOBILE_MEMBERSHIP_REVOKED` | 403 | The workspace or membership ended (the session ends too) |
| `MOBILE_SCOPE_DENIED` | 403 | A pre-tenant bearer on a tenant route, or a forged choice |
| `MOBILE_NOT_FOUND` | 404 | No such route |
| `MOBILE_IDEMPOTENCY_CONFLICT` | 409 | The same idempotency key with another choice |
| `MOBILE_MFA_EXPIRED` | 410 | The challenge expired, was used, or ran out of tries: sign in again |
| `MOBILE_SELECTION_EXPIRED` | 410 | The workspace choice expired: load the list again |
| `MOBILE_ACCOUNT_LOCKED` | 423 | Too many failed sign-ins or codes; try later |
| `MOBILE_CONTRACT_UNSUPPORTED` | 426 | Unknown app profile, unknown contract version, or an app below the minimum version |
| `MOBILE_UNAVAILABLE` | 503 | The service could not answer; retry |
| `MOBILE_UPSTREAM_TIMEOUT` | 504 | The service took too long; retry |

## Not yet served

`GET /mobile/v1/bootstrap`, OIDC, invitations, `issuerId`/`membershipId` in the token response (needs your new token
contract version), Home, CMMS, Workforce, windows, records and lookups. Calls to them answer `404 MOBILE_NOT_FOUND`.
