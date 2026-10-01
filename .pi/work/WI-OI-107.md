# WI-OI-107: industry packs at the solution layer (ADR-0016 F10)

- **Status:** Review. Built, verified and deployed in one batch (owner, 2026-10-01: "go" with D1–D5 as recommended;
  this settles the GPT agent's Task 2d).
- **Owner:** SDLC Orchestrator / Configuration Studio / Solution Architecture.
- **Decision records:** ADR-0016 F10, the WI-OI-074 seven-layer pack design, owner decisions D1–D5 in the task card.
- **Task card:** `.pi/tasks/WI-OI-107.md`. Proof scripts: `.pi/handoff/proof-scripts/e2e-107.sh`, `deploy-107.sh`,
  `geo-it.sh`; spec `e2e/specs/packs.spec.ts`.
- **Independent reviewers:** Product, Web/Accessibility, QA/SDET.

## G0: why

Industry packs lived in three places (Workforce's JSON files, a hand copy in Configuration Studio, and Workforce's own
per-tenant switch), held Workforce content only, and were owned by a module. A new industry (agriculture) needs one
pack covering every module, installed per tenant with no code and no deploy.

## G2: acceptance

1. One pack format with a section per module, grouped by the seven layers; each module declares what it reads.
2. One source of truth for every shipped pack, checked by the repository audit.
3. A tenant activates a pack once in Configuration Studio; each module receives and keeps its section.
4. Manufacturing keeps exactly today's content; a new industry (agriculture) installs with no code and no deploy.

## What changed

### 107a: one pack format

- `IndustryPackV2` and `CountryPackV2` (`packages/contracts/src/configuration/packs.ts`): a header (slug or code,
  label, `major.minor` version) and `modules.<module>.<layer>` sections. Layers: vocabulary, fields, lists,
  capabilities, workflows, outcomes, rules (layer 7 holds parameters for coded rules only).
- Section schemas per module: Workforce (vocabulary, lists, capabilities; country: rules), Geospatial (lists: place
  types). Layers without an engine have no schema until WI-OI-074 to 078 add one; the format does not change.
- Modules declare the layers they read in `module.yaml` (`spec.pack.industry`, `spec.pack.country`).

### 107b: one source of truth (D1, D2)

- `solutions/packs/industry/*.yaml` (10: the 9 converted packs and a new agriculture starter pack) and
  `solutions/packs/country/*.yaml` (6, Japan included). Converted from the governed copy, which held every value of
  the Workforce JSON files (checked field by field: no difference).
- `pnpm modules:catalog` validates every pack (format, file name, version, each section's module and layer against
  the module's declaration) and compiles them into `@gigalibs/contracts` (`SHIPPED_INDUSTRY_PACKS`,
  `SHIPPED_COUNTRY_PACKS`); the contracts tests parse every pack against its schemas. Solution files are checked
  against these packs.
- Deleted: `modules/gigaops/config/industry-packs`, `country-packs` (14 files) and the hand copy in
  `configuration-core` (1,360 lines). The unregistered Workforce prototype `PacksService` reads the shipped packs; its
  `POST packs/activate` controller is removed (D5).

### 107c: activation and delivery (D3)

- Configuration Studio installs packs at the solution scope (`moduleKey: solution`, format 2.0); no module entitlement
  is needed to install or read them. Packs installed under Workforce before (format 1.0) stay readable and are
  converted on read; four test tenants have them.
- One active industry pack and one active country pack per tenant: activating one deactivates the other packs of
  that kind (both scopes).
- After an activation (also a rollback and Demo Lab provisioning), the kernel queues one `pack.apply` job
  (`module.call`) per module that has a section and is enabled for the tenant, as the member who activated it. The
  job holds only the published version; the worker reads the module's section from it when it runs. `grants()` now
  treats `maps:*` as covering `maps.…` permissions, as the modules do.
- `GET configuration/packs/active`: the tenant's active packs in format 2, for server-side readers (Demo Lab).

### 107d: modules keep their section (D5)

- Workforce migrations 000015 `pack_sections` and 000016 (version id as text, see below); `POST v1/pack/apply` (`workforce.configuration.manage`) validates the
  section, keeps one copy per kind, audits `WORKFORCE_PACK_APPLIED`; an identical re-send changes nothing.
  `GET v1/pack` (through the web gateway).
- Geospatial migrations 000007 `pack_sections` and 000008 (version id as text); `POST v1/pack/apply` (`maps.node-types.manage`) adds the pack's place
  types the tenant lacks (never renames or removes one), keeps the section, audits `SPATIAL_PACK_APPLIED`.
  `GET v1/pack` through the web proxy.
- Demo Lab reads the active pack in format 2 (place types from the Geospatial section, the profile from `demo`).
- Web: Configuration › Industry packs lists the shipped packs with Install, then Studio approves, publishes and
  activates them. The industry form templates on that tab are layer 2 (fields and forms) and stay with WI-OI-075.

## Verification

- Contracts (packs parse, manufacturing parity field by field, V1→V2 lossless, scope rules), configuration-core 34,
  kernel 12 (pack reader for V2 and legacy V1, pack-apply jobs, entitled-only queueing), Workforce pack service,
  Geospatial on a throwaway PostgreSQL (migrations 1–7: pack apply seeds missing types, keeps existing labels,
  refuses scoped members), web (Demo Lab route on format 2, gateway equivalence).
- `pnpm verify`: PASS (known WORKFORCE_API_URL drift only).

## Deploy and live proof

- **Deploy** (batch, 2026-10-01): backups before each run; no new secrets (the kernel worker gets the existing
  Workforce and Geospatial URLs and signing keys). Migrations: Workforce 15 and 16, Geospatial 7 and 8; the others
  unchanged. Services started consumers before producers. Live at **`2a48e326e327-93674f4f9ea2`**, every service
  healthy, the web on 5180.
- **Bug found by the live proof and fixed:** the first deploy (`…-fa6ff947699d`) activated packs but queued nothing.
  Configuration Studio's published version ids are cuids, not UUIDs; the pack application contract, the job payload
  check and the two `published_version_id` columns assumed UUIDs, so the pack reader found no section and stayed
  silent. Fixed in all three places (columns widened by Workforce 16 and Geospatial 8; both tables were empty), the
  activation response now lists the queued jobs, an activated pack that yields nothing is logged, and the tests use
  cuid ids.
- **Disk:** builds stopped twice at the 60 GB guard; the superseded first-105 images were pruned with the guard's own
  setting and the owner freed space outside Docker (option A).
- **Live web proof:** a real login, signed module contexts, 14 Playwright tests.
- **Packs end-to-end proof** (`e2e-107.sh`, spec `e2e/specs/packs.spec.ts`; a throwaway tenant with Workforce,
  Geospatial and Analytics and two Tenant Admins, web on 127.0.0.1:5190):
  - Configuration › Industry packs lists the shipped packs; Agriculture is installed from the screen.
  - The author submits; their own approval is refused (403); the second administrator approves; the author publishes
    and activates. The response lists two jobs (Workforce, Geospatial).
  - Workforce holds the agriculture section (`worker: Farm Hand`, `workUnit: Harvest Run`); Geospatial now has the
    place types FARM, FIELD and BLOCK and holds its section.
  - The India country pack reaches Workforce only (pay-rule settings).
  - Activating Manufacturing makes it the one active industry pack (`packs/active`: manufacturing and in); Workforce
    switches to the manufacturing wording; Geospatial adds manufacturing's place types and keeps agriculture's.
  - The screen shows Manufacturing as Active and Agriculture no longer active (`e2e/artifacts/packs-configuration.png`).
  - Kernel jobs for the tenant: five `pack.apply` runs, all SUCCEEDED on the first attempt.

## Open for the owner

- Polish (next batch): a pack already published but not active still shows Install on the packs panel, which would
  create a second draft; it should point to Studio instead.

- The industry form templates in the web (`lib/industry-workforce-templates.ts`) are industry content outside packs;
  they belong to layer 2 and move with WI-OI-075.
- Removing the unregistered Workforce prototype (packs, payroll and others) is a package-inventory decision (F7).
