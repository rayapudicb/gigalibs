# Module conversion kit

How a module moves its screens onto metadata windows (ADR-0033 D1; the "Metadata first" ground rule of
`docs/plans/platform-implementation-plan.md`). Product Catalogue (U7), Universal Inventory (F0.5) and the Finance
general ledger (U12) followed it; CMMS (WI-OI-120t) and Workforce (WI-OI-120u) follow it next. One command says whether
a conversion is complete:

```
pnpm build && node scripts/verify-module-conversion.mjs <module>
```

`pnpm verify` runs it for every converted module, with `node scripts/generate-windows.mjs --check`.

## Steps, in order

### 1. Windows

- One window per surface, in `modules/<module>/dictionary/<surface>.window.json`. The surface key starts with the
  module's short name (`finance-accounts`).
- Write them from a source, `modules/<module>/dictionary/windows.mjs`, which exports `windowSource(builderFor)`.
  `builderFor({ route, createWith })` returns the helpers in `scripts/lib/window-builder.mjs`:
  `entity`, `field`, `values`, `lookup`, `tab`, `section`, `relationship`, `action`, `view`, `dictionary` and
  `window`. The Finance, Catalogue and Inventory sources are worked examples.
- Then run:

  ```
  node scripts/generate-windows.mjs <module>
  pnpm modules:catalog
  ```

  Never edit the JSON by hand: `--check` refuses a window that differs from its source.
- **Field rules (S1):**
  - `required` and `readOnly` on the field.
  - `visibilityCondition`, `readOnlyCondition` and `requiredCondition` on a placement.
  - `defaultValue`, fixed or `{ "$default": "TODAY" | "NOW" | "CURRENT_USER" }`.
  - `validationRules` reading the fields of one record type.

  The record dispatcher enforces all of these as the window does. A field must have the same rules in every window
  that shows it.
- Lookups name a resolver (`lookup('book-ref', 'finance-books')`). `createWith` offers "Add new" through the window
  that creates the records (F0.6). Workspace data no module holds comes from the platform lookups (`PLATFORM_LOOKUPS`
  in contracts: `workspace-members`, `organization-units`); the module's web package routes them with
  `lookupBasePaths: PLATFORM_LOOKUP_BASE_PATHS` (WI-OI-120u).
- A field only some people may change takes `writePermission` (for example a login link): the window shows it
  read-only without it, and the adapter's field policy carries the same permission so the dispatcher refuses it too.

### 2. Record adapters

- One adapter per record type, in `apps/api/src/<area>/<area>-record-adapters.ts`, each calling the module's own
  domain service. An adapter never reads or writes tables.
- Declare every field a window shows, with `writable: false` for fields the domain sets.
- Give every action a permission. The window's action must ask for the same permission.
- Build the dispatcher with the window rules:
  `new RecordDispatcher(adapters, resolvers, idempotency, shippedRecordRules('<module>'))`.
- Add the module to `CONVERTED` in `scripts/verify-module-conversion.mjs` (dispatcher path and factory name).

### 3. Gateway and pages

- `records: true` on the module's gateway in `module.yaml` (its catalogue entry declares `requiredPermission`).
- Every route the windows' screens call outside the record routes is in the gateway's `routes`. The check cannot see
  hand-written panels, so a walk-through or proof must call each one.
- Each window's `route` is one of the module's `ui.pages`, and that page draws the window with `MetadataWindow`.
- Remove the hand-written component once nothing points at it. Specialised interactions (maps and CAD, kiosks,
  boards, clock-in, scanning, builders) stay as components inside the governed screen (the named exceptions).

### 4. Roles

- Module roles in `module.yaml` (WI-OI-120n) grant every permission the windows ask for, so someone other than a
  Tenant Admin can do the work.
- No module role carries workspace administration, or a permission in `NOT_DELEGABLE_PERMISSIONS`.

### 5. Registers and journey

- **Canonical owners** (`docs/architecture/canonical-owners.md`): the module's concepts and who owns them.
- **Access paths:** list, read, write, action, lookup, report, export and job, each with its permission and scope.
- **The tenant-to-value journey** (`e2e/specs/journey-tenant-to-value.spec.ts`): a section that does the module's
  first-value path as the module's roles.
- A proof script (`scripts/verify-<card>-*.mjs`) over HTTP through the gateway or module host. It includes a direct
  call refused what the window prevents (`422 RECORD_RULES`).

### 6. Later, when the engine lands

- E1, the document lifecycle: the window's actions come from the document's lifecycle graph.
- E2, posting: the posting policy each document follows.

## What the check refuses

- A window that does not compile: an unsupported field, reference, action, permission or default; or conflicting
  field rules.
- A field shown that the adapter does not declare, or one editable in the window that the adapter does not accept.
- A tab on a record type the dispatcher does not register.
- An action the dispatcher does not register, or one shown for a permission other than the one the server requires.
- A lookup no converted module, and not the platform, serves.
- A window whose route is not a module page, or a gateway without record routes.
- A window permission no module role grants (a permission in `NOT_DELEGABLE_PERMISSIONS` is exempt: only
  administrators hold it).

Findings the owner has accepted until a named card closes them go in `KNOWN`. They print as `KNOWN` and do not fail;
a `KNOWN` finding that no longer occurs fails until it is removed.
