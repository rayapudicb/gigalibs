# WI-OI-120r (S1): Field rules the server enforces too

- **Status:** Approved (owner, 2026-10-06). M1a card of `docs/plans/platform-implementation-plan.md` (moved before CMMS on
  2026-10-06); starts after R1 (WI-OI-120q). Each slice is shown before it starts.
- **Work item:** WI-OI-120. Evidence goes in `.pi/work/WI-OI-120.md`.
- **Size:** M

## Why

- A window can already say when a field is **shown, locked or required** (`visibilityCondition`,
  `readOnlyCondition`, `requiredCondition` on a field placement, `packages/contracts/src/configuration/dictionary.ts`).
  The screen obeys them (`packages/configuration-react/src/window/window-model.ts:85-88`). Publishing already refuses
  a rule the engine cannot run (`packages/configuration-core/src/dictionary-capabilities.ts`).
- **The server does not obey them.** The record dispatcher (`packages/module-sdk/src/record-dispatcher.ts`) checks
  permissions, paging, versions and replays, but not the window's rules. A direct API call can leave out a field the
  screen requires, or write one the screen locks or hides. Only Product Catalogue re-checks its validation rules, and
  it does so by hand (`catalogue.service.ts`).
- **Defaults** (`defaultValue`) are declared but the metadata window never applies them, and there is no "today" or
  "me" default.

Every module conversion (CMMS, Workforce, then the rest) would inherit this gap, so it is fixed once, before them.

## Goal

What the screen prevents, the server refuses, with the same message on the same field. Fields start with their
declared default.

## Design

1. **One rule set per entity.** For every entity, the module's windows (`modules/<m>/dictionary/*.window.json`) must
   give each field the same shown, locked and required rules. `scripts/module-manifests.mjs` refuses a conflict, and
   collects the rules into the module's generated baselines.
2. **The dispatcher enforces them** on every create, update and action that changes fields. It works on the record as
   it would be after the change (current values plus the changes), using the same evaluator as the screen
   (`evaluateDictionaryCondition`, `validateDictionaryRules` in `@gigalibs/configuration-core`), so the two cannot
   disagree:
   - a required field (always, or by rule) that is empty: refused;
   - a write to a field that is locked (always, or by rule on the current record) or hidden by rule: refused;
   - a validation rule of severity ERROR that fails: refused. WARNING and INFO are returned, not refused.
3. **One answer shape**: `422 RECORD_RULES` with `fields: { <fieldKey>: <message> }`. The window shows each message
   under its field, as it does for its own checks.
4. **Defaults.** On create, a field left empty takes its default. A default is either a fixed value or one of a closed
   list of tokens: `TODAY`, `NOW`, `CURRENT_USER`. The screen fills them in when the form opens. The server fills
   them in when the value is absent. Publishing refuses an unknown token, and a default the field's type cannot hold.
5. **Scope.** Rules come from the module's own windows. When workspace customization lands (S4), the server checks
   against the workspace's published window, through the same function.

## Scope

- **May change:** `packages/contracts` (default tokens, the 422 shape), `packages/configuration-core` (evaluator,
  publish checks), `packages/module-sdk` (dispatcher), `packages/configuration-react` (defaults, field messages),
  `scripts/module-manifests.mjs` and generated baselines, tests.
- **Must not change:** module domain services, applied migrations, permission codes, running services.

## Proof

- Dispatcher tests: required by rule, locked by rule on the current record, hidden by rule, ERROR versus WARNING,
  defaults (fixed and each token), and a direct API call refused for each case the screen prevents.
- Manifest check: two windows that disagree on a field's rule are refused.
- The Inventory, Catalogue and Finance windows still publish and their UAT walk-throughs still pass.
- `pnpm build`, `pnpm test`, `pnpm verify`.

## Done when

- [ ] The dispatcher refuses what the screen prevents, with field messages the screen shows.
- [ ] Defaults are applied on screen and on the server.
- [ ] The three modules already on metadata still pass.
- [ ] Checks pass; evidence recorded.

## Stop and ask if

- a window already on UAT relies on the server accepting something its rules forbid (that would be a data
  correction, not a code change).
