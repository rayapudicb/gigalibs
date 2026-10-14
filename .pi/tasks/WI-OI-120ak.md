# WI-OI-120ak: Zero-mock sweep, the rest (plan v3 step 0.4)

- **Status:** Approved (owner, 2026-10-15: "approved 120ak, D1a, D2a, D3a, D4a, D5a, D6a, D7a"). S1 in progress.
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

- [ ] The audit fails on each kind of mock listed in G, and its baseline is empty.
- [ ] No page or API on UAT shows invented data, fakes a result, or keeps business data only in the web app's memory.
- [ ] Each decision D1 to D7 is applied as chosen.
- [ ] Evidence recorded; each slice released, reviewed and deployed by the owner; journey and screen inventory rerun.
