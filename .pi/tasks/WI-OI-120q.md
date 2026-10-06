# WI-OI-120q (R1): One permission vocabulary and one matcher

- **Status:** Approved (owner, 2026-10-06: "R1 approved"). Implemented 2026-10-06 (8631f02, plus the review fixes,
  uncommitted). The independent Security review and its re-check are recorded; the one remaining finding is fixed.
  Evidence: `.pi/work/WI-OI-120.md` § WI-OI-120q. First M1a card
  of `docs/plans/platform-implementation-plan.md` v2; ADR-0034 accepted in direction 2026-10-06. Independent Security
  review before deploy (access change).
- **Work item:** WI-OI-120. Evidence goes in `.pi/work/WI-OI-120.md`.
- **Size:** M

## Why

Whether a person may do something is decided by **twelve separate matchers with at least five different rules**:

| Matcher | Rule today |
| --- | --- |
| `apps/workflow-platform/lib/module-access.ts` (web menu and gate), `packages/configuration-react/src/window/window-model.ts` (renderer) | `*`, exact, or the family wildcard (`cmms:*` covers `cmms.work-orders.read` and `cmms:read`) |
| `modules/analytics-studio/.../authorization.ts`, `modules/gigaops/.../auth/authorization.ts` | `*`, own module wildcard, exact, or any family's wildcard |
| `modules/physical-operations-cmms/.../authorization.ts` (`hasCmmsPermission`), `modules/geospatial/.../authorization.ts`, `modules/gigaops/.../bookings.service.ts`, `.../time.service.ts`, `packages/module-sdk/src/signed-context.ts` (`hasModulePermission`) | `*`, own module wildcard, or exact only |
| `packages/module-sdk/src/record-dispatcher.ts` (`holds`) | `*`, exact, or a wildcard on everything before the first colon. **Defect:** a dotted code has no colon, so `cmms.work-orders.read` yields the family `cmms.work-orders.rea` and `cmms:*` never matches. Harmless today (the three dispatcher modules use colon codes); it would refuse administrators the day a dotted-code module moves onto the dispatcher. |
| `packages/rbac-core/src/evaluator.ts` (control-plane guard, SCIM) | `*` or `all`; a two-part grant covers every three-part code beneath it; a third part is read as a scope (`own`, `team`, `all`); dotted codes never match a wildcard |
| `apps/playground-api/src/configuration-studio.service.ts` | `*` or `all`; resource and action wildcards such as `*:read` |

Verified: no role grants `all` or a `*:action` wildcard today, and `finance:journals:post` does not satisfy
`finance:journals:approve` in the control-plane evaluator (an unknown third part is refused). The risk is
inconsistency: the same grant can be allowed by the web and refused by an API, or the reverse.

## Goal

One vocabulary, one matcher, used everywhere; a catalogue of real permissions for the role editor.

## Design

1. **One function** in `@gigalibs/contracts` (pure, no dependencies), `permissionMatches(granted, required)`, with
   one rule:
   - a code is a family followed by one to three parts, written with colons (`finance:journals:post`) or dots
     (`cmms.work-orders.write`); both spellings of the same parts are the same permission;
   - a grant matches when it is `*`, or equal to the required code (after normalizing separators), or the family
     wildcard `family:*` of the required code;
   - nothing else: no `all`, no `*:action`, no partial-family or prefix matching, no implicit "two parts cover three".
   - The control plane's ABAC scopes (`own`, `team`) move to an explicit, separately named check where they are used
     (rbac-nest guard), so a third part is never silently a scope.
2. **Every matcher delegates to it**: the twelve above, `hasPermission` and `holds` helpers kept as thin wrappers so
   call sites do not change. The dispatcher defect is fixed by construction.
3. **Catalogue:** `scripts/module-manifests.mjs` collects the permissions each module declares (gateway route
   permissions, module roles, catalogue `requiredPermission`) with the control plane's own list into a generated
   catalogue in `@gigalibs/contracts`. The custom-role editor (Settings → Team) lists the catalogue instead of its
   hard-coded 40 codes; saving a role with a code not in the catalogue is refused.
4. **No code renames.** Codes stay as they are; a later card may move modules to one spelling.

## Behaviour changes (each tested)

- A family wildcard (`organization:*`) now covers its family's dotted codes in CMMS, Geospatial, Workforce bookings
  and time, and the SDK guard, as it already does in the web, renderer, Analytics and Workforce's main guard.
- Two-part grants no longer cover three-part codes in the control plane; checked against every base and module role
  before the change, with a migration note if any role relied on it.
- `all` and `*:action` stop matching in the control plane and Configuration Studio (no role grants them).

## Scope

- **May change:** `packages/contracts` (matcher, catalogue, tests); `packages/module-sdk` (guard, dispatcher);
  `packages/rbac-core`, `packages/rbac-nest`; `packages/configuration-react`; `apps/workflow-platform`
  (`module-access.ts`, Settings → Team role editor); `apps/playground-api` (Configuration Studio check, SCIM call);
  the permission helpers of CMMS, Geospatial, Workforce and Analytics; `scripts/module-manifests.mjs` and generated
  files.
- **Must not change:** permission codes, role grants, the signed context contract, applied migrations, CMMS
  import/export files, other agents' work, running services.

## Proof

- A table-driven test of `permissionMatches` covering every rule above, both spellings, and refusals (`cmmsx.read`
  against `cmms:*`, `cmms.work-orders:*`, `all`, `*:read`, prefixes, empty and malformed codes).
- **Equivalence check:** every base role and module role evaluated against every catalogue permission with the old
  matchers and the new one; the differences are exactly the "Behaviour changes" above, listed in the evidence.
- Every module's existing authorization tests pass on the shared matcher; the dispatcher's dotted-code case gets a
  test.
- `pnpm build`, `pnpm test`, `pnpm verify`; the WI-OI-120m journey after deploy.

## Found during the work

The inventory was larger than twelve. Three groups would widen access beyond the list above; the owner chose to
include them (2026-10-06, "include them"):
- the configuration `DictionaryRenderer`: Tenant Admins now see 236 and Managers 5 field permissions they already
  hold through a family wildcard (Managers: `workflows:*`);
- the eSignature, Ontology, Saga and Document Scanner guards: they honour the family wildcard;
- 15 inline checks in web pages, now `holdsAnyPermission` (equivalent for the colon codes they check).

## Done when

- [x] One matcher; every call site delegates to it (17 matchers, 5 module guards and the renderer, 15 inline checks).
- [x] The equivalence report shows only the intended behaviour changes: no losses; the gains are the owner's
  "include them" (DictionaryRenderer 241; AR, Spend, Tax, Recovery and Currency 84).
- [x] The role editor lists catalogue permissions only.
- [x] Checks pass; Security review recorded before deploy; evidence recorded.
- [ ] Images built and handed to the owner (after commit, and after the b7f8a53 deploy).

## Stop and ask if

- the equivalence check shows a role losing or gaining access not listed above;
- a module relies on `own` or `team` scopes beyond the rbac-nest guard.
