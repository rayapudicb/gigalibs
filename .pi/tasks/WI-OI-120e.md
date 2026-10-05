# WI-OI-120e (U3.2): security defects in code that runs on the UAT instance

- **Status:** Review (implemented and committed 2026-10-05; not deployed). Approved by the owner 2026-10-05; lockout
  numbers: the proposed 5 failures / 15 minutes.
- **Work item:** WI-OI-120 (U3 in `docs/audits/2026-10-04-production-readiness/remediation-backlog.md`). Evidence goes
  in `.pi/work/WI-OI-120.md`.
- **Size:** L

## Goal

Close the U3 findings whose code is deployed today, so a tester's results cannot be spoiled and no tenant can reach
another tenant's data:
- P1-20: login has no throttle or lockout.
- P0-04: Rule Studio edits or deletes any rule by ID.
- P0-08: the Connector Hub webhook takes the tenant from a header and checks the signature only when a secret exists.
- P1-25: the offline punch queue is shared by everyone on a device.
- P1-24: the dictionary renderer grants every permission by default.

## Scope

- **May change:**
  - `packages/auth-nest` (login);
  - `packages/db` (schema plus one forward migration for the login throttle);
  - Rule Studio kernel routes and store (tenant scoping only);
  - `components/gigaops/TimeAndAttendance.tsx`;
  - the Connections page test-webhook control and the Connector Hub proxy allow-list;
  - `modules/universal-connector-hub` (webhook controller and service, raw request body, forward migration 000009);
  - `packages/configuration-react/src/DictionaryRenderer.tsx`;
  - tests for each of these.
- **Must not change:**
  - applied migrations;
  - other modules;
  - running services (the owner deploys).

  Never, on any card:
  - the CMMS import/export files;
  - another agent's work;
  - secrets;
  - the web on port 5180.

## Read first

- Audit README §5 (P0-04, P0-08, P1-20, P1-24, P1-25).
- `packages/auth-nest/src/auth.service.ts` (`login`, and the MFA lock at lines 640–680, the pattern to follow).
- `app/api/rules/kernel/rules/[ruleId]/route.ts` and `lib/universal-rule-kernel-store.ts`.
- `modules/universal-connector-hub/apps/api/src/webhooks/*` and `lib/connector-hub-proxy.ts`.

## Steps

1. **Login (P1-20).**
   - Count failed logins per account, keyed by a hash of the normalised email. Unknown emails are counted the same
     way and are checked against a dummy hash, so a caller cannot tell which accounts exist.
   - Five failures within 15 minutes lock that email for 15 minutes: the login answers 429 with a retry time, and
     an audit entry is written. A successful login resets the count.
   - These numbers are a proposal; the owner may change them.
   - Limits per network address belong at the ingress (production track).
2. **Rule Studio (P0-04).**
   - Update, toggle and delete act only on the signed-in tenant's rules; any other rule answers 404.
   - The body cannot change `id`, `tenantId` or `scope`.
   - `GLOBAL_SYSTEM` rules are read-only to tenants.
   - Still open, and stated on the status board: in-memory storage and the seeded rules. U21 rebuilds Rule Studio on
     the Rules API.
3. **Connector Hub webhook (P0-08).**
   - The URL carries an unguessable endpoint ID, and the tenant and connection come only from it. `X-Tenant-Id` is
     ignored.
   - A connection without a webhook secret refuses webhooks.
   - The HMAC is checked over the raw request bytes, not re-serialised JSON. Duplicates are refused by idempotency
     key, as today.
   - The Connections page's simulate button, broken today (it sends a fixed tenant and the proxy does not expose
     webhooks), becomes "Send test webhook". This signed route needs `connections:test`, and the hub signs and
     ingests the test payload for the caller's tenant.
4. **Punch queue (P1-25).**
   - The offline queue is stored per user and tenant, and replayed only for that user and tenant.
   - Signing out clears it.
5. **Renderer (P1-24).** Default permissions are none; callers pass the user's permissions.
6. Run `pnpm build`, `pnpm test` and `pnpm verify`. Build images, then hand the deploy to the owner with a backup
   taken first.

## Done when

- [x] Each finding has a test that fails on the old code and passes on the new.
- [x] Login:
  - [x] the sixth wrong password within 15 minutes answers 429;
  - [x] an unknown email gets the same answers and timing class;
  - [x] the right password works after the lock expires.
- [x] Rule Studio: tenant B gets 404 updating, toggling or deleting tenant A's rule, and a body cannot change the
      tenant or scope.
- [x] Webhook, proven on an isolated database:
  - [x] `X-Tenant-Id` with no valid signature answers 401;
  - [x] a valid signature over the raw bytes is accepted once;
  - [x] a replay is not stored twice;
  - [x] a connection without a secret refuses.
- [x] Punch queue: user B never sees or submits user A's queued punches.
- [x] `pnpm build` and `pnpm test` pass; `pnpm verify` passes or reports only the known drift.
- [x] Evidence is recorded in `.pi/work/WI-OI-120.md`; `.pi/NOW.md` and `uat-module-status.md` are updated.
- [ ] No finding is marked closed until the named Security reviewer (D7) accepts it.

## Not in this card

These findings are in modules that do not run on this instance. Each is fixed when its module moves onto the module
SDK and is deployed (U29), on its own card:
- P0-05: Workflow Studio, Rule Pro and Data Studio take a caller-chosen tenant.
- P0-07: AR webhook secrets.
- P0-10: Multi-Currency's fabricated CTA.
- P1-10: the tenant setting is applied outside its transaction.
- P1-11: prototypes fail open on authentication.

The P2 found in U3.1 is also out: custom roles can assign tenant administrator.

## Stop and ask if

- the owner wants different lockout numbers;
- a step would change a running service, the database or the owner's data;
- the webhook endpoint change needs a provider-side URL update for a real connection. None exists today (read-only
  check, 2026-10-05): the instance holds 16 connections, all test data, and none belongs to a real tenant.
  - Three are seeded (`salesforce-crm`, `coupa-procure`, `plaid-cards`) under tenant IDs that do not exist.
  - Thirteen belong to the "Pull proof" tenants.
  - Both groups belong to the D5 clean-up.
