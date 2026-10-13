# WI-OI-120ag: The CMMS guard enforces the record routes' baseline permission

- **Status:** Carded, not started (owner, 2026-10-13: "card I-new-3"). Shown to the owner before it starts.
- **Found by:** the independent re-check of the WI-OI-120u Security review fixes (finding I-new-3, informational).
- **Work item:** WI-OI-120. Evidence goes in `.pi/work/WI-OI-120.md`.
- **Size:** XS

## Why

CMMS mounts the module SDK's record routes:
- `createRecordController({ guard: CmmsAuthorizationGuard, readPermission: 'cmms:read' })`;
- the routes declare their baseline with the SDK's `RequirePermissions` (metadata `MODULE_PERMISSIONS_METADATA`).

`CmmsAuthorizationGuard` reads only its own metadata key, `cmms.required-permissions`
(`modules/physical-operations-cmms/apps/api/src/auth/authorization.ts`, near line 120). So the `cmms:read` baseline is
not enforced inside the module.

Nothing is exposed today:
- the record dispatcher checks every record type's and action's own permission;
- the web gateway requires `cmms:read` before it forwards.

Workforce had the same gap and closed it in 481af92 (WI-OI-120u, B1).

## Design

1. The CMMS guard also enforces `MODULE_PERMISSIONS_METADATA` (from `@gigalibs/module-sdk`), as the Workforce guard
   does, with the same start-up check that the constant exists.
2. A test drives the CMMS record routes through the real guard over HTTP: 403 without `cmms:read`, 200 with it (as
   `modules/gigaops/apps/api/src/resources/record-routes.spec.ts`).

## Scope

- **May change:** `modules/physical-operations-cmms/apps/api/src/auth/authorization.ts` and a new spec.
- **Must not change:** the CMMS import/export files, other agents' uncommitted work.

## Done when

- [ ] The CMMS record routes refuse a caller without `cmms:read` inside the module; the test proves it.
- [ ] Evidence recorded; owner informed.
