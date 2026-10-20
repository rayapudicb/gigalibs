# WI-OI-120bs: SPEED S2b — metadata panels (platform)

- **Status:** Built and committed 2026-10-20 as `ad75a0f1` on branch `feat/speed-s2b-metadata-panels` (owner: "start S2b", "commit S2b"); not merged, not pushed. Implementer: Claude Code, in its own worktree
  `/Users/rayapudi/dev/gigalibs-speed-s2b`, branch `feat/speed-s2b-metadata-panels` (from `6ea5a927`). No overlap with
  Cursor's WI-OI-120bp/120bq files (checked 2026-10-20).
- **Work item:** WI-OI-120bn, slice S2b of `docs/pharma/speed/SPEED-Stage1-Implementation-Plan.md` (§3.3).
- **Size:** M.

## Goal

A metadata window can place a **registered module component** (a "panel") on a tab or in a section, with typed props,
so module screens such as SPEED's calculation views are positioned, ordered, shown or hidden by metadata, while what a
panel draws stays reviewed code. Same principle as plan v3 GU3 "cards from the renderer": a closed catalogue.

## Design

1. **Catalogue in the module manifest.** `module.yaml` → `spec.ui.panels[]`: `componentKey` (namespaced by the module),
   `binding` (`RECORD`: the panel reads the tab's current record), and `props` with a closed set of prop types
   (string, number, boolean, enum) and `required`. `pnpm modules:catalog` generates the catalogue for the compiler.
2. **Contract.** A tab gains optional `panels[]`: `panelKey`, `componentKey`, `sectionKey`, `position`, `span`, `props`,
   `visibilityCondition`. Optional with no default, so every existing window and its checksum stay byte-identical.
   `DICTIONARY_CAPABILITY_VERSION` goes to 2.
3. **Publish check (fail closed).** The compiler refuses a panel whose component is not registered, is registered by
   another module, has an unknown, missing or mistyped prop, points at an undeclared section, or has a bad condition.
   Without a catalogue, every panel is refused.
4. **Renderer.** `configuration-react` takes a panel registry (component key → React component) and renders panels
   in position with the fields; an unregistered component at run time shows a visible "panel unavailable" state,
   never a crash or a silent gap.
5. **Builder.** `scripts/lib/window-builder.mjs` gains `panel(...)` so module window sources can declare panels.

## As built (2026-10-20)

- **Contract** (`packages/contracts/src/configuration/dictionary.ts`): `DictionaryPanelPlacementV1` (panel key,
  component key `<prefix>.<name>`, section, position, span, typed props, read permission, visibility condition);
  `ModulePanelDefinitionV1` (module, component key, binding `RECORD`, props of type STRING, NUMBER, BOOLEAN or ENUM
  with values); `tab.panels` optional with no default; `DICTIONARY_CAPABILITY_VERSION` 2 with `panelBindings`.
- **Catalogue**: `scripts/module-manifests.mjs` validates `spec.ui.panels` (key format, one prefix per module, unique
  keys, binding, prop types) and generates `packages/contracts/src/configuration/panels.generated.ts`;
  `modulePanelCatalogue()` parses it with the schema. Empty until a module registers a panel.
- **Publish check** (`configuration-core`): `PANEL_NOT_REGISTERED`, `PANEL_NOT_OWNED`, `PANEL_BINDING_UNSUPPORTED`,
  `PANEL_PROP_UNKNOWN`, `PANEL_PROP_TYPE`, `PANEL_PROP_REQUIRED`, `PANEL_KEY_DUPLICATE`,
  `PANEL_ON_CHILD_TAB_NOT_SUPPORTED`, `MISSING_SECTION`, `PERMISSION_INVALID`, condition checks. **Record tabs:** a
  further level-0 tab must show the main entity, hold panels only and hold at least one
  (`RECORD_TAB_ENTITY_MISMATCH`, `RECORD_TAB_FIELDS_NOT_SUPPORTED`, `RECORD_TAB_EMPTY`). Without a catalogue every panel
  is refused. The control plane's publish paths (`configuration-studio.service.ts`, both compile calls) and the S16
  conversion check pass `modulePanelCatalogue()`.
- **Renderer** (`configuration-react`): `MetadataWindow` takes `panels` (a registry of components); `placedPanels`
  applies the read permission and visibility condition; the record view shows a tab strip over the main tab and the
  panel-only record tabs; panels merge with fields by position inside sections (read view only; the edit form is
  unchanged); `MetadataPanel` shows an unregistered component as "This panel is not available", naming it.
- **Builder** (`scripts/lib/window-builder.mjs`): `panel(...)`, and `tab(..., { panels, position })`.

## Evidence so far

- Contracts, configuration-core and window tests: **445 passed** (48 files), including 9 publish-check tests, 5
  renderer tests and 4 contract tests for panels.
- **All 46 shipped module windows compile to the identical checksum** before (`1b2df602` code) and after S2b.
- `generate-windows --check`: every committed window matches its source; `modules:catalog` check passes.
- **Full `pnpm verify` in the worktree:** build passes (all packages and apps, including the control plane's publish
  service); every audit passes, including `audit:layers`, `audit:design-tokens` and `module conversions (S16)`;
  tests **3,111 passed**, 230 skipped. Two playground-api test files fail at load with "CONTROL_PAYLOAD_KEY_VERSION must
  be configured": they read the main worktree's local `.env` files, which are gitignored and absent from a new
  worktree (not copied: they hold secrets). They test execution events and operational intelligence, touch nothing
  S2b changed, and passed in the main worktree's full run on 2026-10-20.

## Done when

- [x] Contract, compiler, catalogue generation, renderer and builder changed as above, with tests.
- [x] Every existing module window compiles to the same checksum as before (46 of 46); `generate-windows --check` unchanged.
- [x] `pnpm verify`: build and every audit pass (the other session's design-token files are not in this branch).
- [x] Committed `ad75a0f1` on its branch (owner: "commit S2b").
- [ ] Rebase on the main branch's tip and merge with S1, when the owner decides (after Cursor's 120bp and 120bq).
