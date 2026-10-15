# WI-OI-120ak: Zero-mock sweep, the rest (plan v3 step 0.4)

- **Status:** S1–S5 on UAT (release `162508b`, owner deploy 2026-10-15; journey rerun pending). S5b, S6 and L2
  committed (`4ba6bab`); release `f6123bf` was stopped before its build by its Security review (M1); S5c fixes it.
  S7: the `demo-lab` switch is off; the brand workspaces wait for the owner. Decisions D1a–D7a approved
  2026-10-15 (D1b replaced D1a).
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

## Security review of S3b and S4 / release a4ac027 (2026-10-15): approve with conditions

No High findings, and no authorization change beyond Communications going to CONTAINED. The release matches 3868fe5.
Follow-ups are slice **S4b**, released with S5.

- **Correction, M1:** "the screen shows a refused answer" (S4 above) is wrong. The Communications screen sets `error`
  but never renders it. On UAT's 503 a tester sees empty lists, "Real-time sync", and an invented metric card
  ("Avg. Delivery Success 99.5% / Zero packet drop across providers"). Message loading and the send, create and
  dispatch actions also do nothing on a refusal. Fix: render the error; remove the invented card and the "Real-time
  sync" and "cluster" texts; report every refused action.
- **M2 (existing, already known as P1-26 / WI-OI-119 U-11):** `apps/workflow-platform/public/demo/index.html` is a static
  demo of an invented AR app.
  - It is served without sign-in at `/demo/index.html`.
  - It loads unpinned third-party scripts (`unpkg.com/lucide@latest`, `cdn.tailwindcss.com`) on the app's own
    origin, with no content security policy.
  - The audit never scans `.html`.

  Fix: delete `public/demo/` and add `.html` to the scanned extensions.
- **L1:** the growth check can be bypassed:
  - by duplicating a tolerated line;
  - because `existedAt` uses a substring match, so text that existed only in a comment counts;
  - by keeping the first line of a multi-line match and adding new records under it.

  Fix: run the rules over the ref's file, and allow a fingerprint the old baseline lacked only as often as it occurs
  there.
- **L2:** fingerprints use the first line of the match, so records under a tolerated `useState([` can be swapped. Fix:
  fingerprint the matched text.
- **L3:** the store pattern still misses fields with no modifier, types containing `=>`, nested generics,
  `new Map(seed)`, `new Set()`, `= {}`, and code written without semicolons. There are no current misses.
- **Info:**
  - `--baseline-since` with an empty value is skipped silently; it should fail;
  - pass `github.base_ref` to CI through `env:`;
  - a failed connection test shows only "Test failed", because the hub returns `error`, not `message`;
  - delete the orphan `scripts/verify-communications-textfly-integration.mjs`, which imports the deleted store;
  - for the Connector Hub's card: `webhooks.service.ts` puts `target_workflow_code` into a URL without encoding it.
- **Verified by the review:**
  - the audit passes in every mode, and the growth check passes against 639db36, 85fdbcc, HEAD, a4ac027 and the zero
    SHA; a bad ref fails;
  - 27 roots, which is every tracked app and module;
  - the route-folder scan is correct;
  - the Communications route gives 503, 413 and 502 with no fallback, and its access checks are unchanged;
  - the catalogue change is consistent;
  - the Connections targets and the test message read the hub's real fields;
  - Inventory's suffix is adequate (32 random bits within a millisecond);
  - the deletions are unused, and the drawer is unmounted and untouched;
  - 19 of the 21 files are identical in the release; the script and the lockfile differ only by the release base.

## S4b, the second review's follow-ups (2026-10-15): built and verified locally

- **M2:** `apps/workflow-platform/public/demo/index.html` is deleted: an invented AR app served without sign-in, which
  loaded unpinned third-party scripts on the app's origin. Nothing linked to it. The audit now scans `.html`.
- **M1:** the Communications screen:
  - shows every refusal with the service's own words (loading, messages, reply, create channel, create template,
    dispatch), and reports invalid dispatch variables instead of ignoring them;
  - no longer shows the invented "Avg. Delivery Success 99.5% / Zero packet drop" card or "Real-time sync";
  - its loading, success and title texts no longer claim a "cluster", "instant delivery" or a "simulator".
- **L2:** each match is fingerprinted by what it matched, whitespace collapsed; for the record rules, by the whole
  literal from its opening bracket to the closing one. Each match in the audit's output carries its fingerprint.
- **L1:** `--baseline-since` scans the ref's file with today's rules. A fingerprint is tolerated at most as often as
  the larger of the old baseline's count and the ref's own matches, so the same occurrence is never counted twice.
  The substring check is gone. A flag without a ref fails.
- **L3:** the store rule now also catches typed fields with no modifier, arrow types, nested generics,
  `new Map(seed)`, `new Set()`, `= {}`, and code without semicolons. Measured on the web app: the same matches as
  before, no false positives.
- **Info:**
  - CI passes the base ref and the push's `before` through `env:`;
  - a failed connection test shows the hub's `error`;
  - the orphan `scripts/verify-communications-textfly-integration.mjs` is deleted.
- **Proof** in a throwaway copy:
  - a copied mock line listed twice passes the plain audit, but the growth check fails it;
  - swapping the records under a tolerated `useState([` line fails;
  - editing inside a tolerated literal fails;
  - the growth check passes against HEAD, 85fdbcc, 639db36 and the zero SHA;
  - an empty `--baseline-since` fails.
- **Verification:** baseline 11 entries, 26 fingerprints; both audit modes pass; web type-check clean; 1,006 web and
  contracts tests passed; lint unchanged.

## Decisions for S5 (owner, 2026-10-15: "commit S4b, D1b, Demo Lab as proposed")

- **D1b, replacing D1a:** the UAT preview opens only PLANNED modules (real modules on metadata: Product Catalogue,
  Inventory, Procurement, Orders, Finance), never CONTAINED ones (prototypes, many backed by mock). Turning the
  setting off (D1a) would also have hidden the five real modules on UAT.
- **D5a as proposed:**
  - the Demo Lab code goes from every layer: control plane, web, Analytics API and contracts;
  - the deployed migration 000015 (the synthetic-reset function) stays: deployed migrations are never edited;
  - the `demo-lab` switch, on in 4 UAT workspaces, is switched off by S7's owner-run cleanup.

## S5, the preview, Rule studio and the Demo Lab (2026-10-15): built and verified locally

- **D1b:** `lib/module-access.ts`. The UAT preview lifts the lock only for PLANNED modules: Product Catalogue,
  Inventory, Procurement, Orders and Finance. CONTAINED modules stay locked on UAT as everywhere, for tenants and for
  platform inspection, in both the API rule (`canUseTenantModule`) and the screen and menu rule
  (`canOpenPlatformModule`). The setting stays on. Tests: `module-access.test.ts` proves PLANNED opens and five
  CONTAINED modules (AR, E-Signature, Communications, Master Data, Rule studio) stay closed.
- **D3a:** `rule-studio` is CONTAINED in `modules/universal-rule-pro/module.yaml` (catalogue regenerated). Its tenant
  boundary suite skips while locked, by the repository's `isLockedModule` convention, and runs again when the module
  is revived.
- **D5a, Demo Lab removed** (WI-OI-064e, 064f and 103d d7): the platform-admin tool that created labelled demo
  workspaces and filled Analytics with generated facts and a "sample farm".
  - Control plane: `demo-lab.controller.ts`, `demo-lab.service.ts` and `scripts/verify-demo-lab.mjs` are deleted.
    `ConfigurationStudioService.provisionDemoCatalogue` is removed: it let any `demo-lab` workspace activate a
    catalogue without independent approval.
  - Web: the Demo Lab admin page, its API route, `DemoLabConsole`, the Explore `SampleFarmPanel`, the drill-down's
    Demo Lab panel and badge, and the admin link are gone; `analyticsPageAccess` no longer reports `demoLab`.
  - Analytics API: `demo-lab.service.ts`, the `v1/demo-lab` controller and their specs are deleted. The sample-farm
    generator moved to `test/support/proof-farm.ts`, which is never compiled into the build or shipped. The two
    database proofs use it as their test data.
  - Contracts: the Demo Lab schemas and `sample-farm.ts` are removed. The industry packs' demo profiles stay, as part
    of the pack data model.
  - The deployed migration 000015 stays (forward-only). The `demo-lab` switch in 4 UAT workspaces goes off in S7.
- **Baseline:** 10 entries, 24 fingerprints. The sample-farm entry is gone, and the AR, Master Data and Rule-studio
  entries are now "locked".
- **Verification:**
  - type-checks clean: web, control plane, Analytics API, contracts. The moved generator and proofs check too, except
    a type error in `real-database-proof.ts` line 171 that is the same at HEAD;
  - 1,526 tests passed across web, contracts, Analytics API and control plane (130 skipped);
  - both audit modes and the growth check against HEAD pass;
  - all ten audits pass on HEAD plus S5's 36 files alone;
  - lint against HEAD: unchanged, except fewer findings in the drill-down explorer and the Analytics controller.

## Security review of S4b and S5 / release 162508b (2026-10-15): approve with conditions

No High or Medium findings; nothing blocks the deploy. Follow-ups, slice **S5b**, to land with S6 or S7:

- **Correction, L1:** "nothing opens a CONTAINED module, not even platform inspection" (S5) is not true for one route.
  `app/api/communications/[...path]/route.ts` still lets platform operators and `*` holders past the module lock, the
  entitlement and the permission. Today they reach only the 503: compose never passes `COMMUNICATIONS_API_URL` to web.
  Fix before Communications is ever connected (a condition of WI-OI-120ap): remove the bypass so the route uses
  `canUseTenantModule` and `hasPermission`, as the other 12 CONTAINED routes do.
- **L2:** the deployed migration's `gigalibs_analytics.reset_synthetic_facts` (SECURITY DEFINER) stays callable by the
  analytics runtime role, and its tenant guard relies on a session setting. Fix: a forward migration that drops it,
  after S7's cleanup.
- **Correction, L3:** "`test/support/proof-farm.ts` is never shipped" (S5). It is never compiled or loaded, but the
  image very likely contains it as inert TypeScript source: the package has no `files` field, and `pnpm deploy` copies
  the package, as it already does for `scripts/`. Fix: `"files": ["dist"]` in the Analytics API package.
- **Info, to fold into S5b, S6 or S7:**
  - the app and studio layouts switch Currency on from feature and permission, ignoring the lock, so on UAT a
    `multi-currency` workspace sends two refused calls from every page; gate them with `canUseTenantModule`;
  - `rule-studio` and `communications-textfly` are CONTAINED but still `trialEligible: true`; set false;
  - `canInspectPlatformModule` has no readiness check and no production caller; remove it;
  - Demo Lab leftovers: `docs/runbooks/demo-lab-sandbox.md`, two comments, and the `SYNTHETIC: 'Demo Lab'` label in
    `SourcesWorkbench.tsx`;
  - **S7 must remove the 4 demo workspaces' synthetic facts and sources**, not only switch the feature off: they now
    show in the place drill-down without the "synthetic" badge;
  - `ModuleAccessGate` tells a CONTAINED module's user "not in your plan"; it should say the module is not available;
  - the audit's `locked` label is not checked against the catalogue (record the module key and assert it is
    CONTAINED); only the two record rules fingerprint whole literals; `balancedEnd` ignores comments and regex
    literals (it affects only how much a fingerprint covers); CODEOWNERS for `scripts/` and `config/`.
- **Verified by the review:**
  - D1b is correct in both rules, and every caller was checked: the 13 CONTAINED API routes, the signed proxy's 7
    gateways, the sidebar, the module gate and `/modules`;
  - UAT loses 13 modules: 11 opened by the preview, plus Communications and Rule studio. None is used by the journey,
    the module host or any REVIEW screen;
  - D3a: all 8 Rule handlers check the lock first;
  - D5a: no Demo Lab code path remains, and the approval bypass is gone;
  - the audit passes in every mode, and the growth check passes against eight refs;
  - `public/` is empty;
  - the release matches 63dd8ad except the audit script's release-base section.

## S5b, the third review's follow-ups (2026-10-15): built and verified locally (not in release 162508b)

- **L1:** `/api/communications/*` no longer lets platform operators or `*` holders past the module lock, the entitlement
  or the permission; it uses `canUseTenantModule` and `hasPermission`, as the other contained routes do. Test: both are
  refused while the module is contained. The service-answer tests skip until the module is revived.
- **L3:** the Analytics API package ships only `dist` (`"files": ["dist"]`), so the test-support generator stays out of
  the image. At runtime it reads only an optional `.env`; migrations are copied into the image separately. Confirmed by
  the next release build.
- **Currency:** the app and studio layouts ask Currency only when `canUseTenantModule('multi-currency', …)` allows. It
  is CONTAINED, so a workspace no longer sends two refused calls from every page on UAT.
- **Trials:** `rule-studio` and `communications-textfly` are no longer trial-eligible (catalogue regenerated).
- **Inspection:** `canInspectPlatformModule` is removed, with its tests. It had no readiness check and no production
  caller, and its tests asserted the opposite of D1b.
- **Access gate:** an unreleased module (CONTAINED, or PLANNED outside the preview) says "not available yet", never
  "not in your plan" or "your role". New test: `module-access-gate.test.tsx`.
- **Demo Lab leftovers:**
  - `docs/runbooks/demo-lab-sandbox.md` is marked retired;
  - two comments are corrected;
  - the Sources label for synthetic sources reads "Synthetic (not real data)";
  - WI-OI-011 (FR-13) carries the removal note in `WORK_ITEMS.md` (status corrected to Review in S5c).
- **Audit:** a baseline entry tolerated as `locked` names its catalogue module, which must be CONTAINED. Proof:
  pointing an entry at a released module fails.
- **Left for later:** L2 (drop `reset_synthetic_facts`, after S7's cleanup); CODEOWNERS for `scripts/` and `config/`
  (needs the owner's GitHub handles); fingerprints for the non-record rules; `balancedEnd` comment and regex awareness.
- **Verification:** type-checks clean; 1,520 tests passed (149 files); both audit modes and the growth check pass; the
  module manifests are current.

## S6, the help panel (2026-10-15): built and verified locally (D7a; not in release 162508b)

- **Help comes from the catalogue.** `lib/module-knowledge-registry.ts` no longer holds 27 hand-written entries. For a
  page inside a module (the most specific route wins), the help gives:
  - the catalogue's name, area and status line (`reason` in `module.yaml`), shown as written;
  - the module's pages, from the generated menu;
  - the rule the access check enforces, in words: "Only platform operators can open it" (Platform Control Tower);
    "Nobody can open it until it is released" (CONTAINED); otherwise the permission and the plan, plus "Platform
    operators can also open it inside a workspace" where the catalogue allows inspection;
  - a limit for a module that is not released: in review; on the UAT instance only, for testing (PLANNED); not
    released (CONTAINED).
- **Gone:** internal ports, schemas, "Audit Standards", "immutable audit trail", "data isolation enforced at the
  database layer", "biometric punches", and the fallback that claimed them for every other page. A page outside every
  module now says "No help is written for this page yet." and nothing else.
- **Kept as written:** `/gigaops/time` (checked against the Workforce API, WI-OI-120an) and `/connectors` (it repeats
  what the page itself says, S3). The Time entry's two warnings moved from the rules to the limits.
- **The drawer:** a section shows only when it has content; the green shield marks only rules the system enforces;
  limits get a neutral icon. The "Operational Guide" badge, the numbered steps, the technical-specifications panel and
  the "Tenant-Isolated Scope Active" footer are removed. Headings: "What this is", "What you can do here", "Rules the
  system enforces", "Limits to know".
- **Tests:** new `module-knowledge-registry.test.ts`:
  - each module's help matches its catalogue fields and generated menu;
  - the access sentence is checked against `canOpenPlatformModule` for every module (member, member without the
    permission or the plan, operator, preview);
  - the readiness limits match;
  - the fallback claims nothing;
  - the help's own words make none of the old claims. A module's status line is the catalogue's and is not checked
    here: Dynamic Forms' says "immutable publication".

  `gigaops-time-screen.test.ts` now reads the limits, and checks that the warnings are not listed as rules.
- **Lint:** the drawer's findings go from 12 at HEAD to 4. All 4 were reported at HEAD too: the backdrop's click
  handler (2), the route-change effect and the import order.
- **Verification:**
  - web type-check clean;
  - web suite: 686 tests passed, 118 skipped (the locked modules' suites);
  - whole repository, with S5b: 2,942 tests passed, 231 skipped, none failed (376 files);
  - the audit and its growth check pass.

## S7, re-scoped from UAT's data (2026-10-15, read-only)

What UAT holds today changes how S7 is done, not what D5a and D6a decided:
- **No synthetic data is left.** `gigalibs_analytics.operational_facts` is empty, and no source is SYNTHETIC; the Demo
  Lab's 8 resets removed them. Nothing is deleted.
- **D5a, the `demo-lab` switch:** the 4 workspaces are CANCELLED, with no members and no `demo-lab` entitlement rows.
  Only the key in `tenants.features` is left, and no code reads it since S5. It is removed by one guarded statement,
  after a backup. The statement changes exactly those 4 rows, or nothing.
- **D6a, the brand workspaces** (Netflix Studios Europe, Paramount Pictures Corp, Warner Bros Discovery): ACTIVE, no
  members. The product already does this, so no script is written. In Platform Control Tower, open the workspace,
  give a reason, and press **Suspend Workspace** (`PATCH /platform/tenants/:id/status`). The action:
  - writes a `STATUS_CHANGE` audit record with the reason;
  - revokes the workspace's sessions;
  - is undone with **Reactivate**.

  Seeded rows stay as they are.
- **Checked afterwards, read-only:** 3 SUSPENDED, 4 without `demo-lab`, 3 audit records, no active session in the 7.

## L2, the synthetic-reset function dropped (2026-10-15): built and verified locally (not in release 162508b)

- New forward migration `000030_drop_synthetic_reset.up.sql` drops `gigalibs_analytics.reset_synthetic_facts`.
  Nothing calls it, and UAT holds no SYNTHETIC facts. On UAT any role can execute it (`=X`, public), it runs as its
  superuser owner, and its tenant check trusts a session setting.
- `refresh_place_rollup_statistics` (same migration 000015) stays, because place rollups call it. It is also
  public-executable, but only runs `ANALYZE` on one table. Recorded as Info; not changed here.
- The expected Analytics migration version is now 30 in `runtime-config.ts` and `compose.modules.local.yaml`. The
  Analytics `.env.example` still says 29: the owner keeps `.env*` files closed to agents.
- **Verification:**
  - Analytics type-check clean; 368 Analytics tests pass;
  - the real-database proof applies all 30 migrations to a throwaway PostgreSQL and passes;
  - the audit and its growth check pass;
  - UAT's ledger is at 29, so the next deploy runs migration 30.

## Security review of release f6123bf (2026-10-15): approve with conditions; fix M1 before deploying

- **M1, deploy blocker (fails closed):** the Analytics migration job in `compose.modules.local.yaml` still expected 29
  while the directory ends at 30. `run-module-migrations.mjs` refuses before it connects, so the deploy would stop at
  `analytics-migrations`, after the other modules' jobs and with no migration 30. L2 had raised only the API's pin.
  The build of `f6123bf` was stopped in its first stage; `f6123bf` is never built or deployed.
- **L1:** the access gate called a PLANNED module "not available yet" on UAT, where the preview opens it.
- **Info:**
  - I1: platform inspection opens a module's pages, but every data API still needs the plan and the permission. The
    help should say so.
  - I2: `refresh_place_rollup_statistics` stays as it is (only `ANALYZE`; no role but the runtime role has `USAGE` on
    the schema).
  - I3: a rollback to `162508b` after migration 30 must skip `analytics-migrations`. The `162508b` job refuses a
    newer ledger; its API accepts it (`>=`) and no longer calls the dropped function.
  - I4: a `locked` baseline entry is not tied to its file's module; the growth check stays the guard.
  - I5: SUSPENDED blocks sign-in, refresh, workspace switch, OIDC, the web session, the tenant guard and kernel
    schedules, and revokes sessions. Inbound Connector Hub webhooks and outbox relays do not check it, and workload
    admission has no production caller.
  - I6: the trial-invariant spec would have failed at `162508b`; S5 ran targeted suites only.
  - I7: the handoff `deploy-uat.mjs` must run with the release worktree's compose.
- **Verified:**
  - release parity: identical patch-ids;
  - L1 for all five methods and HEAD;
  - no other path past a CONTAINED lock;
  - `files: ["dist"]` honoured;
  - Currency gating;
  - every CONTAINED and PLANNED module is not trial-eligible;
  - the help's rules match the access check, rendered as text only;
  - migration 30 is idempotent, with no remaining reference;
  - the audit passes in every mode.

## S5c, the review's follow-ups (2026-10-15): built and verified locally

- **M1:** `analytics-migrations` expects 30.
- **New check `scripts/verify-migration-pins.mjs`, in CI:**
  - each module's migration job, API pin and code version must equal the migration its image ships last;
  - a job pinned below that refuses and stops the deploy;
  - the one allowed exception is a declared hold: CMMS stays at 19 until step 1.3 (WI-OI-120aj M3);
  - a compose migration job missing from the check fails it.

  Proof: it fails on `f6123bf` with exactly M1, and passes on `162508b`, `85fdbcc` and the fix.
- **L1:** the gate says "not available yet" for CONTAINED, and for PLANNED only outside the UAT preview; on UAT a
  PLANNED module the workspace lacks says "not in your plan". Test added.
- **I1:** the inspection sentence now says operators can open the pages, and that the data still needs the permission
  and the plan. The registry test checks that `canUseTenantModule` refuses the operator.
- **I5, checked read-only on UAT:** the 3 brand workspaces have no Connector Hub rows, no source connections, ingestion
  streams or credential references, and no pending outbox events. Suspending them leaves nothing running.
- **Correction:** S5b set WI-OI-011 to "Retired", which `config/sdlc-governance.json` does not allow; the SDLC
  governance check failed on `4ba6bab`. It is back to Review, with the removal note. The label is decided in step 0.6.
- **I6:** the whole repository suite now runs before each release.
- **Verification:** whole repository 2,943 tests passed, 231 skipped, none failed (376 files); the 7 CI governance
  checks pass; web type-check clean.

