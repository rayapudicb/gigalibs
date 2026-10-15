# WI-OI-120ai: Extending a trial keeps the administrator's choice of modules

- **Status:** Built and verified locally (2026-10-15); owner approved plan v3 step 0.5 "as recommended".
- **Found by:** the independent Security review of da77c98 and 711d32f (finding I1, informational; pre-existing and
  confirmed in code).
- **Work item:** WI-OI-120. Evidence goes in `.pi/work/WI-OI-120.md`.
- **Size:** XS

## Why

In Platform Control Tower (`packages/tenancy-nest/src/platform-administration.service.ts`):

- `updateEntitlements`, run while a tenant is on trial, upserts every eligible module with `source: 'TRIAL'` and sets
  the ones the administrator did not select to `DISABLED`.
- `extendTrial` then sets **every** `source: 'TRIAL'` row to `ENABLED` (its `tenantModuleEntitlement.updateMany` with
  `where: { tenantId, source: 'TRIAL' }`). Extending a trial therefore switches back on the modules the administrator
  had switched off.
- `extendTrial` writes no `tenant.entitlements.changed.v1`, so the windows of modules it turns on only appear after the
  next API start (see da77c98).

## Design (to be confirmed with the owner)

1. `extendTrial` moves the trial end on the TRIAL rows and keeps each row's status: modules switched off stay off.
2. When an extension does change the enabled set (for example a lapsed trial whose modules were ENABLED), it calls
   `recordEntitlementsChanged` (`packages/tenancy-nest/src/entitlement-events.ts`) in the same transaction.
3. Tests:
   - an extension keeps a DISABLED trial module disabled;
   - an extension that changes nothing enabled writes no event;
   - one that does change the enabled set writes the event after the rows.

## Scope

- **May change:** `platform-administration.service.ts` (`extendTrial`) and its tests.
- **Must not change:** entitlement data on UAT; other agents' work.

## Done when

- [x] Extending a trial keeps every module's enabled or disabled choice; tests prove it.
- [x] Any change to the enabled set writes `tenant.entitlements.changed.v1`.
- [ ] Evidence recorded; included in the next release.

## Built (2026-10-15)

- `extendTrial` (`packages/tenancy-nest/src/platform-administration.service.ts`):
  - moves the end of the TRIAL rows and keeps each row's status;
  - enabled trial modules record the actor and the reason;
  - a switched-off module keeps who switched it off and why, and only its end moves.
- **The event:** the enabled set is worked out before and after with the same rule as `tenancy.service.ts`
  (ENABLED, started, not ended). Only when it differs does the extension write `tenant.entitlements.changed.v1`,
  carrying the enabled set after the extension, as the transaction's last write. The event's consumer
  (`ModuleWindowBaselineService`) reads the rows themselves.
- **Tests** (`platform-entitlements-outbox.test.ts`):
  - no update sets a status, and the switched-off row gets only `endsAt`;
  - an extension that changes nothing enabled writes no event;
  - a lapsed trial coming back writes the event with the full enabled set (a PLATFORM_OVERRIDE module included),
    after the row updates.
- **Proof:** against HEAD's `extendTrial`, the first and third tests fail.
- **Verification:**
  - tenancy type-check clean;
  - tenancy suite 79 passed (48 skipped: database integration tests);
  - lint on both files as at HEAD (the service's pre-existing import order and format), with the new lines formatted.

