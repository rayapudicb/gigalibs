# WI-OI-120ak: Zero-mock sweep, the rest (plan v3 step 0.4)

- **Status:** S1–S3 on UAT (release `85fdbcc`). S3b and S4 committed (2026-10-15); their release is being prepared.
  Then S5–S7. Decisions D1a–D7a approved 2026-10-15.
- **Follows:** WI-OI-120ah, WI-OI-120an and WI-OI-120ao (the Time screen, done).
- **Work item:** WI-OI-120. Evidence goes in `.pi/work/WI-OI-120.md`.
- **Size:** L, delivered as slices S1 to S7, each with its own commit, release, review and check.

## Why

AGENTS.md: "No production-reachable mock data, fake provider result, silent fixture fallback, default tenant,
embedded credential, or local-only business persistence is permitted." Plan v3 counts UAT as production.

## Inventory (read-only, 2026-10-15)

The scan covered:
- `INITIAL_/DEMO_/SAMPLE_/SEED_/MOCK_` constants;
- fake waits;
- in-memory stores and their importers;
- placeholder people;
- module readiness;
- the live UAT database.

### A. On every page

1. **"Softphone & WhatsApp" button** (`components/communications/OmnichannelSoftphoneDrawer.tsx`, mounted in
   `app/(app)/layout.tsx`):
   - the chat starts with invented messages ("En route to Substation 4…", "WO-4892") and fake delivery ticks;
   - sending only adds the message on screen.

   **Another session has uncommitted changes to this file.**

### B. Modules in REVIEW (open wherever the workspace has them)

2. **Communications** (`/communications`, `/api/communications/*`, `lib/communications-store.ts`):
   - with no `COMMUNICATIONS_API_URL` (UAT has none), the API answers from an in-memory store inside the web app;
   - every workspace is seeded with invented channels ("Twilio SMS Primary Carrier"), conversations ("Sarah Jenkins
     (Acme Corp)"), messages and campaigns;
   - sends go nowhere;
   - with a real service configured, any failure falls back silently to the store;
   - data is lost on restart.
3. **Rule studio** (`/rules`, `/api/rules/kernel/*`, `lib/universal-rule-kernel-store.ts`): rules are kept in the web
   app's memory, so they are lost on restart and not shared between web instances.
4. **Connectors** (`/connectors/[slug]`): saving credentials fakes success. The code says "In production: POST …
   Here we simulate success": it waits 800 ms, shows "saved" and stores nothing.
5. **Analytics Studio Demo Lab** (feature `demo-lab`):
   - `modules/analytics-studio/apps/api/src/places/sample-farm.service.ts` generates synthetic harvest data;
   - the control plane has a matching `demo-lab.service.ts`.
6. **Test inputs, to label rather than remove:**
   - `/connections` `SAMPLE_WEBHOOK_PAYLOADS` (presets for "send a test event");
   - `/workflows` per-workflow sample run inputs (`VEND-ACME-CORP`, `SO-2026-8819`, …).

   These are legitimate as test inputs only if the screen says so and the person can edit them.

### C. Modules in CONTAINED, opened on UAT only by the preview switch (`GIGALIBS_UAT_PREVIEW=enabled`)

7. **Master data** (`/platform-admin/master-data`, `/api/master-data`):
   - `lib/master-data-store.ts` is in memory;
   - its seed `lib/master-data-catalog.ts` says of itself "DEV SEED ONLY … Do NOT use in production". It holds
     invented customers, vendors, accounts and signers (e.g. "Jane Doe", `sarah.connor@example.com`).
8. **Accounts Receivable** (`/ar`) and **E-Signature** (`/esign`) read that seed catalogue directly. **Tax** (`/tax`)
   and **Ontology** (`/ontology`) are also CONTAINED.

### D. Dead in-memory code (no importer anywhere)

9. In `apps/workflow-platform/lib/`:
   - `ontology-store.ts`, `event-fabric-queue.ts`, `governor.ts`, `ootb-client-workbench-store.ts`,
     `oauth-handshake-store.ts`, `saga-orchestrator.ts`, `tenant-ingestion-store.ts`;
   - `reports-engine.ts`, which alone imports `ar-ledger-store.ts` and `tax-ledger-store.ts`.

   All of them seed invented companies ("Apex Tactical Logistics", "Salesforce CRM" and others).

### E. UAT data

10. Three active workspaces named after real companies, all created 2026-08-31: "Netflix Studios Europe"
    (`netflix-europe`), "Paramount Pictures Corp" (`paramount-pictures`) and "Warner Bros Discovery" (`warner-bros`).

### F. The help panel

11. `lib/module-knowledge-registry.ts`:
    - 27 hand-written entries with claims nobody checks (`/gigaops`: "verified physical or biometric punches"; Sites:
      "automatic mobile muster");
    - the fallback for every other page claims "All actions logged to immutable tenant audit trail" and "Data
      isolation enforced at the database layer";
    - entries print internal ports and schemas;
    - every guardrail, warnings included, gets a green shield.

    Only `/gigaops/time` was made true (WI-OI-120an).

### G. The guard

12. The runtime-data audit catches in-memory fixtures in Workforce code only (WI-OI-120ah). It does not catch:
    - in-memory stores behind API routes;
    - fake waits;
    - "simulate success";
    - "DEV SEED ONLY" files;
    - placeholder people in other modules.

Already clean: the Assistant (reverted in WI-OI-120aj) and the Time screen (WI-OI-120ah/an/ao).

## Decisions (owner, 2026-10-15: D1a, D2a, D3a, D4a, D5a, D6a, D7a)

- **D1, UAT preview switch.** Plan v3 counts UAT as production, but `GIGALIBS_UAT_PREVIEW=enabled` opens every
  CONTAINED and PLANNED module on UAT, including C7 and C8.
  - **a (recommended):** turn it off. Those modules are then locked on UAT as in production, until each is rebuilt
    through the S16 kit. It is one setting, applied with the next deploy.
  - **b:** keep it on, and lock only the modules backed by mock.
- **D2, Communications** (B2).
  - **a (recommended):** remove the in-memory store and the silent fallback. Without its service, the API answers 503
    "Communications service not configured", and the module is set to CONTAINED until the TextFly service is wired up
    on a card of its own (TextFly is your untracked `modules/communications-textfly/`).
  - **b:** wire TextFly now (large).
- **D3, Rule studio** (B3).
  - **a (recommended):** set it to CONTAINED until rules have real storage (a card of its own).
  - **b:** build that storage now.
- **D4, Softphone & WhatsApp button** (A1).
  - **a (recommended):** take it off the layout until Communications is real.
  - **b:** keep it with an honest "not connected" state.

  Either way, the other session's uncommitted edits to that file must be settled first: yours to decide.
- **D5, Demo Lab** (B5).
  - **a (recommended):** remove the synthetic generator and its control-plane service.
  - **b:** keep it, off by default and labelled "Demo data" everywhere it shows.
- **D6, real-brand workspaces** (E10).
  - **a (recommended):** an owner-run script, with a backup, that suspends them (reversible), as for WI-OI-120al.
  - **b:** rename them.
  - **c:** leave them.
- **D7, help panel** (F11).
  - **a (recommended):** build each entry from the module manifests (name, description and route; metadata, as plan
    v3 asks). Guardrails and technical specs are dropped unless a test backs them, and the green shield goes from
    warnings. The `/gigaops/time` entry stays as written.
  - **b:** hand-rewrite all 27 entries.

## Slices, in order

1. **S1, guard first.** Extend the runtime-data audit to every module, so nothing new can land:
   - fixture constants;
   - module-level stores or `seedDefaults` behind `app/api` routes;
   - fake waits and "simulate success";
   - "DEV SEED ONLY" files;
   - placeholder people outside tests.

   Today's items are listed in a baseline that names this card. Each slice removes its own lines, and the baseline
   must be empty when the card closes.
2. **S2, delete the dead code** (D9), with its tests. No behaviour changes.
3. **S3, Connectors:** credentials go to the real Connector Hub API, or the page says it cannot save yet. Label the
   B6 test inputs as editable examples.
4. **S4, Communications and the button** (D2, D4).
5. **S5, the preview switch, Rule studio and Demo Lab** (D1, D3, D5).
6. **S6, the help panel** (D7).
7. **S7, the real-brand workspaces** (D6; owner-run).

Each slice is committed, released, reviewed and deployed by the owner. After each, the UAT screen inventory and the
journey are run again.

## Scope

- **May change:** the files listed above, `scripts/verify-runtime-data-integrity.mjs`, module manifests (readiness
  only, D2/D3), the UAT env setting (D1, applied by the owner's deploy), their tests, and owner-run scripts for D6.
- **Must not change:** other agents' uncommitted work (the softphone drawer needs your decision); your untracked
  folders (`modules/communications-textfly/`, `vendor/`, `scratch/` and the others); any deployed migration.

## Done when

- [ ] The audit fails on each kind of mock listed in G (S1: done locally), and its baseline holds no entry for code a
  user can reach. Entries may stay only for code that D1a/D3a lock or that is not deployed, each naming the plan step
  that replaces it.
- [ ] No page or API on UAT shows invented data, fakes a result, or keeps business data only in the web app's memory.
- [ ] Each decision D1 to D7 is applied as chosen.
- [ ] Evidence recorded; each slice released, reviewed and deployed by the owner; journey and screen inventory rerun.

## S1, the guard (2026-10-15): built and verified locally

- **New rules** in `scripts/verify-runtime-data-integrity.mjs`, all modules:
  - `IN_MEMORY_BUSINESS_FIXTURE`, widened from Workforce to every module, for lists and maps;
  - `IN_MEMORY_BUSINESS_STORE`: record maps or lists in web-app store classes, and their seed methods;
  - `SIMULATED_RESULT`: "simulate success" and fake waits on screens;
  - `DEV_SEED_SOURCE`;
  - `IN_MEMORY_SCREEN_RECORDS`: screens that start with invented records (empty editable rows pass);
  - `PLACEHOLDER_PEOPLE_OR_COMPANIES` (an input's placeholder hint passes).
- **Baseline** `config/runtime-data-baseline.json`: 22 entries, 57 matches. Each entry gives the card, the slice, the
  reason and the exact count:
  - more matches fail as new mock;
  - fewer fail until the entry is lowered;
  - the older rules cannot be baselined;
  - an entry is judged only in a scope that scans its file.
- **The baseline by slice:**
  - S2: 6 dead files;
  - S3: the connectors, connections and rules-studio pages;
  - S4: the Communications store, its screen and the Softphone drawer;
  - S5: the Demo Lab sample farm;
  - locked: the rule kernel store (D3a), master data and its template (D1a), the AR new-invoice form (D1a);
  - not deployed: the Spend seed SQL (M-SPEND).
- **Proof** in a throwaway copy:
  - each new kind of mock fails with its code;
  - the placeholder hint and empty rows pass;
  - an extra match in a baselined file fails;
  - a removed match with its entry left fails as stale;
  - baselining an older rule fails.
- **Audits** on HEAD plus S1 alone: all ten pass; both audit modes pass in the shared worktree.
- **Found during S1, not mock:** four web-app services that query the database directly and that nothing imports
  (`telemetry-bridge-service.ts`, `workforce-safety-service.ts`, `prisma-saga-service.ts`, `forms-engine-service.ts`).
  Deleted with S2 (owner, 2026-10-15: "S2 with the four").
- **No release:** the audit is a repository check and does not run on UAT.

## S2, dead code (2026-10-15): built and verified locally

- **Deleted** (owner: "S2 with the four"; nothing imported any of them; 6,304 lines):
  - from `apps/workflow-platform/lib/`:
    - ten in-memory modules: `ontology-store`, `event-fabric-queue`, `governor`, `ootb-client-workbench-store`,
      `oauth-handshake-store`, `saga-orchestrator`, `tenant-ingestion-store`, `reports-engine`, `ar-ledger-store`,
      `tax-ledger-store`;
    - four services that queried the database from the web app: `telemetry-bridge-service`,
      `workforce-safety-service`, `prisma-saga-service`, `forms-engine-service`;
  - their two tests (`ootb-client-workbench`, `reports-engine`);
  - three unwired scripts that exercised them only (`verify-saga-and-event-fabric`, `verify-governor-limits`,
    `verify-saga-persistent`).
- **Trimmed:** three mixed tests now keep only their live contract checks. `forms-dual-mode` covers
  `isFormFieldVisible`, which PublicFormRenderer uses; `workforce-safety-eptw` covers the permit and handover
  schemas; `thingsboard-telemetry-cbm` covers the alert schema.
- **Database package dropped from the web app:** those services were the web app's only users of `@gigalibs/db`.
  It is removed from its `package.json`, its `tsconfig` paths and the lockfile (pnpm also re-resolved one Vitest helper
  to the workspace's `jiti` 2.7.0). The web app now carries no database code.
- **Baseline:** the seven S2 entries are removed (the audit reported all seven as stale until then). Now 15 entries,
  40 matches.
- **Verification:** web type-check clean; web tests 694 passed in 64 files (22 tests of dead code removed; the 109
  skipped unchanged); both audit modes pass; all ten audits pass on HEAD plus S2 alone; the lockfile passes a frozen
  check.
- **No behaviour change.** Next.js bundles only what is imported, so S2 goes to UAT with the next release (S3).

## S3, connectors and test inputs (2026-10-15): built and verified locally

- **Connectors** (owner: "S3 a", then "S3 b", read as one result):
  - a: the hard-coded catalogue (`lib/connector-catalog.ts`, eight outside services called "production-ready") and the
    per-connector page, whose "Connect" pretended to save credentials ("Here we simulate success"), are deleted;
  - b: `/connectors` stays as an honest page. Connecting to outside services is planned in the Connector Hub
    (outbound logins, WI-OI-104) and not available yet; webhooks and scheduled pulls are under Connections;
  - the page had no menu entry, no owning module and no links to it;
  - its help entry no longer claims pre-built SAP, NetSuite and Salesforce connectors, AES-256-GCM storage or a port.
- **Connections:** "Send test webhook" is real: the hub signs it and records it in the workspace's intake journal. It
  now always starts from the neutral `test.ping`, editable, and says the test is real. It used to pre-fill invented
  SAP, AWS and Delta Air Lines transactions for three connection types (`SAMPLE_WEBHOOK_PAYLOADS`, removed).
- **Workflows runner:** "Execute" runs a real workflow. The runner used to:
  - pre-select a hard-coded `WF-O2C-CROSS-BORDER`;
  - pre-fill invented inputs (`PRESET_PAYLOADS`: `VEND-ACME-CORP`, `SO-2026-8819`, …);
  - show a "PORT 4000 LIVE" badge.

  Now it picks the workspace's first workflow once loaded and starts from `{}`, with a note that the run is real;
  "Reset Preset" became "Clear"; the badge is gone.
- **Guard gap fixed:** S1's fixture rule missed both pages: a type annotation with ";" and the `PRESET_` prefix. It now
  catches them. It also caught the rules studio's `SAMPLE_PAYLOADS`, baselined as "locked" with the rest of the rule
  studio (D3a, S5).
- **Baseline:** 15 → 14 entries (38 matches): the connections and connectors entries are gone; the rules studio's
  entries are "locked".
- **Verification:** web type-check clean; web tests 694 passed; lint compared with HEAD under the same config shows
  nothing new (one `any` fewer in each changed page); both audit modes pass; all ten audits pass on HEAD plus S3
  alone.
- **Release:** S2 and S3 go to UAT together (with S1's audit script), as the next release.

## Security review of S1–S3 and release 85fdbcc (2026-10-15): approve with conditions

The release is safe to deploy: every change removes or hides mock data, and none touches authorization. The
conditions are follow-ups, slice **S3b**, done before the card closes.

- **Correction to S1, M1:** the guard does not cover every module, though the S1 commit said it does. The audit's
  `roots` list predates S1 and leaves out:
  - `apps/module-host` and the five modules it hosts on UAT (financial-operations, product-catalogue,
    universal-inventory, universal-orders, universal-procurement);
  - document-scanner, ontology, saga-orchestrator and communications.

  Example of what it misses: `Math.random` in `modules/universal-inventory/.../inventory.service.ts`. Fix: build the
  roots from the tracked `apps/*` and `modules/*` (quarantined ones excepted), then fix or baseline what appears.
- **M2:** creating a connection still offers three invented workflow codes (`WF-O2C-CROSS-BORDER` and two others) as
  its target, and saves one. Fix: load the targets from Workflow Studio, with no default.
- **M3:** the "locked" entries can still be reached on UAT until S5 applies D1a and D3a. Rule Studio is REVIEW, not
  CONTAINED, and keeps tenant rules only in the web process's memory. Acceptable as an interim state only. Fix: S5
  before the card closes; reasons reworded to "to be locked by D1a/D3a in S5".
- **L1:** the store rule misses `readonly` fields, untyped `new Map`, `#private`, `protected`, `static`, module-level
  `new Map()` and `initialize…` set-up methods. In the rule kernel store it matches only the test seed, not the real
  storage. Widen it.
- **L2:** the baseline is counted per rule and file, so swapping one match for another passes, and nothing stops
  entries being added. Fix: fingerprint each tolerated match, and add a check that the baseline never grows against
  the merge base.
- **L3:** the audit skips every folder named `test`, `tests`, `e2e` or `generated`, including live routes such as
  `app/api/connectors/sam-gov/test/`. Skip test folders only outside `app/`, or skip test files by name.
- **L4:** `config/layer-boundary-baseline.json` still lists two files S2 deleted. Remove the lines.
- **L5:** on UAT Workflow Studio is not deployed. Its proxy falls back to `127.0.0.1:4000` (502), and the runner shows
  an empty list under "The run is real…" with no error. Fix: check `r.ok`, say the service is unavailable, and drop
  the local fallback.
- **Info:**
  - the Connections "Test" message overstates what the hub checked ("DNS, credentials, and webhook listener are
    active"; the hub hard-codes `schema_validation: 'PASSED'`). It predates S3; add it to S3b;
  - the runner keeps a selection that a reload removed;
  - two trimmed tests cover contract schemas that no runtime code uses now;
  - a web script imports `packages/db/dist` by path without declaring it.
- **Verified by the review:**
  - the baseline balances in both modes, older rules cannot be baselined, and stale or extra matches fail;
  - the S2 deletions are unused, statically and dynamically, and the frozen Docker install still works;
  - the lockfile change only drops a duplicate dev-only variant;
  - the S3 texts match the hub;
  - the release has 31 of its 33 files identical to the feature branch, and the other two differ only by the release
    base;
  - no authorization change.

## S3b, the review's follow-ups (2026-10-15): built and verified locally

- **M1, coverage:** the audit's roots now come from git's tracked `apps/*` and `modules/*`: 27 roots instead of 17,
  adding the module host and nine modules. The only new finding was in Inventory: nine document numbers (movements,
  receipts, kits, counts, adjustments) built from `Date.now()` plus `Math.random()` from 0 to 999. That is
  predictable, and with per-tenant unique numbers a multi-line receipt could fail one time in a thousand. They now use
  8 hex characters of a random UUID; columns are `varchar(64)` and the longest number is about 30 characters.
- **Dead code found by the wider store rule:** `lib/tenant-infra-orchestrator.ts`, a simulated broker fleet for
  invented "defense", "energy" and "treasury" tenants that nothing imported, is deleted (S2's approval for dead mock).
  With it the web app no longer uses `@gigalibs/broker`, which is removed from its `package.json`, `tsconfig` paths,
  Next transpile list and alias, and the lockfile.
- **M2, Connections targets:** the three invented workflow codes are gone. The target list is this workspace's
  workflows from Workflow Studio, defaulting to "No workflow (intake journal only)". When the service is unavailable,
  the form says events are recorded in the intake journal only.
- **M3:** the baseline reasons now say the master data, AR and rule-studio items stay reachable on UAT until S5
  (slice `S5-lock`).
- **L1:** the store rule now catches any field modifier, `readonly`, `#private`, untyped `new Map<…>()` and
  `initialize…Default…` methods. Constructor parameters (ending in ",") and module-level caches are left out. It now
  matches the rule kernel's real storage, not only its test seed.
- **L2:** the baseline is schema 2.
  - Every tolerated match is fingerprinted (rule, file, line text), so one cannot be traded for another.
  - `--baseline-since <ref>` fails when a fingerprint is new and its line did not already exist at the ref. A widened
    rule may baseline mock that was already there; no change may add a mock line and baseline it.
  - CI runs it with a full checkout, against the pull request's base or the push's previous commit.
- **L3:** folders named `test`, `tests` or `e2e` inside a route tree (`app/…`) and every `generated` folder are now
  scanned (no new findings).
- **L4:** three stale lines for deleted files removed from `config/layer-boundary-baseline.json`.
- **L5 and I6, Workflows:**
  - the Workflow Studio proxy no longer falls back to `127.0.0.1:4000`; without its address it answers 503 "not
    available on this instance";
  - the runner reports a refused answer instead of an empty list;
  - a selection that a reload removed is dropped.
- **I5:** the connection-test message says what the hub checked (the credential or webhook secret, and a network probe
  only when the connection has an address), not "DNS, credentials, and webhook listener are active".
- **For the Connector Hub's own card:** its test hard-codes `schema_validation: 'PASSED'`.

## S4, Communications and the Softphone button (2026-10-15): built and verified locally

- **D2a:**
  - `/api/communications/*` answers only from the Communications service. Without `COMMUNICATIONS_API_URL` (UAT
    today) it answers 503 "not available on this instance"; if the service fails it answers 502. There is no
    fallback;
  - `lib/communications-store.ts` is deleted: seeded invented channels, conversations, messages and campaigns, sends
    that went nowhere, a fabricated WebRTC token and invented call metering;
  - a body too large to read is refused (413) instead of being read unbounded;
  - the screen's types moved to the types-only `lib/communications-types.ts`;
  - the screen shows a refused answer instead of empty lists;
  - its trigger form starts empty, with no invented phone number, "Acme Corp", invoice, OTP code, vendor or work
    order; choosing a module sets only its template and channel;
  - `communications-textfly` is CONTAINED in `modules/communications/module.yaml` (catalogue regenerated). Until S5
    turns the preview off, UAT still opens it and the API answers 503.
- **D4a:** the Softphone & WhatsApp button is off the app layout. The drawer file is untouched: it has another
  session's uncommitted edits, which the owner settles. Its baseline entry stays as `S4-unmounted` until the file is
  deleted.
- **For the TextFly card:** the route sends the tenant and user to the service as plain headers. A signed context, as
  for the other module proxies, is needed before the service is connected.
- **Tests:** `communications-boundary.test.ts` used to check the store's invented token, calls and metering. It now
  checks 401; 403 without the module; 403 for an entitled workspace while the module is contained; 503 without the
  service, with no invented data and no outbound call; 502 when the service fails; and the pass-through with the
  tenant and user. The rating keeps its own test in the contracts package.

## S3b and S4: verification

- Baseline: 11 entries, 26 fingerprints. Both audit modes pass, and the growth check passes against HEAD.
- Web type-check clean. Web and contracts tests: 1,006 passed in 96 files (109 skipped). The contracts package was
  rebuilt for the catalogue change.
- Lint compared with HEAD under the same config: unchanged on every file except one `any` fewer in the Communications
  route.
- All ten audits pass on HEAD plus the 21 files alone (throwaway worktree, removed).
