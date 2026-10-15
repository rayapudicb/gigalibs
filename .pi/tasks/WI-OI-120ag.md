# WI-OI-120ag: The CMMS guard enforces the record routes' baseline permission

- **Status:** Built and verified locally (2026-10-15); owner approved plan v3 step 0.5 "as recommended" (all four
  cards in one release).
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

- [x] The CMMS record routes refuse a caller without `cmms:read` inside the module; the test proves it.
- [ ] Evidence recorded; owner informed.

## Built (2026-10-15)

- `modules/physical-operations-cmms/apps/api/src/auth/authorization.ts`: the guard enforces the module SDK's
  `MODULE_PERMISSIONS_METADATA` together with its own `cmms.required-permissions`, and refuses to start if the SDK
  lacks the constant, as Workforce does.
- New `src/auth/record-routes-guard.spec.ts` drives `createRecordController` over HTTP through the real guard. The
  dispatcher is a stub that would serve anyone, so every refusal comes from the guard:
  - 403 with only `cmms.assets.read`, and with no permission, and the dispatcher is never called;
  - 401 without a signed context;
  - 200 with `cmms:read`, as the signed-in principal.

  A constructor-only subclass supplies the guard's arguments, because the test transform emits no decorator
  metadata; `canActivate` is the CMMS guard's own.
- **Proof:** against HEAD's guard the same test gets 200 for the caller holding only `cmms.assets.read`.
- **Verification:** CMMS type-check clean; 265 CMMS tests pass (33 files). Lint on the guard is unchanged from HEAD
  (3 errors, 1 warning, all pre-existing); the new spec is clean.

