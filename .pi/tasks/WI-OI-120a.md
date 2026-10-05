# WI-OI-120a (U1): Reproducible build, a working UAT instance and every module visible

- **Status:** Approved (owner, 2026-10-05) | In progress (part A). It replaces the withdrawn containment proposal (R1); the owner decided on
  2026-10-05 that nothing is hidden or removed.
- **Work item:** WI-OI-120 (UAT readiness programme from the WI-OI-119 audit). Evidence goes in
  `.pi/work/WI-OI-120.md`.
- **Size:** L (two parts; part B touches the UAT instance and needs the owner's go at that moment)

## Goal

The existing local instance becomes a working UAT instance:

- it runs the current committed code, built from a clean checkout;
- CMMS and Workforce run again;
- every module, including Phases 1–14, appears in the menu for UAT tenants;
- each module carries an honest status label that testers can see.

This closes audit findings P0-12, P1-01 and P1-13 to P1-16.

## Scope

- **May change:**
  - `pnpm-lock.yaml`;
  - `modules/financial-operations/db/runtime-manifest.txt`;
  - `scripts/module-manifests.mjs` (a rule that every migration file is in its runtime manifest) and the files it
    regenerates;
  - forward migrations or runner fixes for the CMMS and Workforce migration failures;
  - `apps/workflow-platform/lib/module-access.ts`, `components/AppSidebar.tsx`, `lib/signed-module-proxy.ts` and a
    new status-label component (UAT visibility);
  - the deployment profile and `infra/compose` env examples (one UAT visibility setting; Finance settings);
  - the seven `scripts/verify-*.mjs` finance proofs and `scripts/verify.mjs` (never write to the UAT database);
  - a Playwright smoke test, `.pi/work/WI-OI-120.md`, `.pi/NOW.md` and this card.
- **Must not change:**
  - module business logic (that is U2 onward);
  - `module.yaml` readiness values (they stay truthful; visibility comes from the UAT setting, not from promotion);
  - already-applied migrations;
  - owner data;
  - secrets in the repository.
- Part B (the UAT instance) starts only after the owner's explicit go.

## Read first

`docs/audits/2026-10-04-production-readiness/README.md` §3–4 and `remediation-backlog.md` ("Rules for every card");
`.pi/work/WI-OI-119.md` RT-1 to RT-10 and S-03 to S-06; `apps/workflow-platform/lib/module-access.ts`;
`infra/compose/generated/compose.module-host.yaml`; `infra/compose/scripts/`.

## Steps

**Part A: in the repository (no running service touched)**

1. Refresh `pnpm-lock.yaml`. Prove `pnpm install --frozen-lockfile` succeeds and the images build from a clean clone
   of the commit.
2. Finance:
   - add `000007` to the runtime manifest and regenerate, so contract, compose and code all say 7;
   - make the manifest check fail when a migration file is missing from its runtime manifest.
3. Diagnose the CMMS failure (`type "gigalibs_cmms.user_ref" does not exist`) and the Workforce failure (ledger 19,
   expected 25). Fix them with forward migrations or a runner fix only. Check whether the extensions migration
   (which moves `ltree`/`btree_gist` to `public`) is involved.
4. UAT visibility:
   - add one deployment setting, on for the UAT instance only;
   - with it on, every module (including `PLANNED`/`CONTAINED` ones) is listed and opens for tenants granted the
     module, through the same server-side decision used by the menu and the API proxy;
   - every module page shows a visible label: "UAT preview", plus "Not connected yet" or "Sample figures, not real
     data" until its own card connects it;
   - with the setting off, behavior is unchanged.
5. The finance proof scripts refuse the UAT database. `pnpm verify` reports them as NOT RUN, never PASS, unless an
   isolated database is given.
6. Tests: unit tests for the visibility decision (setting on/off, granted/not granted). Then `pnpm build`,
   `pnpm test` and the static audits.

**Part B: on the UAT instance (owner's go required first)**

7. Back up with `backup.sh`. Generate the Finance runtime credentials. Apply the control-plane and module
   migrations. Deploy consumers before producers.
8. Record image tags/digests, migration versions and times in `infra/compose/evidence/` and `.pi/NOW.md`.
9. Playwright smoke as a UAT tenant administrator:
   - every module appears in the menu with its label and opens;
   - CMMS and Workforce screens load;
   - the module host reports all hosted modules healthy.

## Done when

- [ ] A clean clone of the commit installs with a frozen lockfile and builds the images
- [ ] Module host starts with Finance, Inventory, Orders, Procurement and Catalogue; CMMS and Workforce run
- [ ] Every module, Phases 1–14 included, is visible and opens on the UAT instance, with its status label
  (Playwright smoke)
- [x] Manifest readiness values are unchanged; with the UAT setting off, nothing new is visible
- [x] Finance proof scripts no longer write to the UAT database
- [x] `pnpm build`, `pnpm test` and static audits pass (known `WORKFORCE_API_URL` drift only)
- [ ] The deploy is recorded; evidence in `.pi/work/WI-OI-120.md`; `.pi/NOW.md` updated

## Stop and ask if

- the CMMS or Workforce fix needs an already-applied migration edited;
- any step in Part B is about to run (backup, migrate, deploy): wait for the owner's go;
- making a module visible exposes a security defect listed for U3 in a way testers could trigger.

## Report

At most five bullets: what changed, the evidence, what's next, and what the owner must decide.
