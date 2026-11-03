# Hand-over to any agent developer — Master Data Foundation and Platform Kit

**From:** Claude (WI-OI-145–151 session), 2026-11-03. **Owner decision:** solve master data and the platform's
developer foundations **before** further modules are built or enhanced; follow the recommendations (ADR-0037–0040);
country order India, Japan, USA, Middle East, Europe, then China, Russia, Africa — and every other country must work
from day one.

## Read first (in this order)

1. `AGENTS.md` (mandatory reading order, Definition of Done, verification) and `CLAUDE.md`.
2. `docs/plans/master-data-foundation-execution-plan.md` — the three levels, the final reference data list, the packs,
   what happens at workspace creation, phases, dependencies and rules.
3. ADR-0037 (ownership, overlaps, hub), ADR-0038 (reference data and packs), ADR-0039 (reference integrity), ADR-0040
   (model-first entities) in `docs/architecture/`.
4. `docs/plans/master-data-and-platform-architecture-analysis.md` — the evidence behind every decision.
5. Your card in `.pi/tasks/WI-OI-152.md` … `WI-OI-162.md`, and its row in `.pi/WORK_ITEMS.md`.

## Where things are

| What | Where |
|---|---|
| Repository and branches | One git repository. Work on a branch cut from `feat/frontline-suite` (for example `feat/master-data-foundation`) in your own worktree. `~/dev/gigalibs` holds other sessions' uncommitted work — do not touch it. The owner builds UAT from a release worktree. |
| Module manifests | `modules/*/module.yaml`; catalogue generator `pnpm modules:catalog` (`scripts/module-manifests.mjs`) |
| Platform reference store | `packages/contracts/src/platform-reference/`, builder `scripts/build-platform-reference-data.mjs`, service `apps/playground-api/src/platform-reference.service.ts` |
| Packs | `solutions/packs/{country,industry}/*.yaml`, format `packages/contracts/src/configuration/packs.ts`, applied by `apps/playground-api/src/kernel-worker/pack-sections.ts` |
| Record rules | `packages/module-sdk/src/record-dispatcher.ts`, `record-controller.ts` |
| Replicas and relays | `packages/module-sdk/src/organization-replica.ts`, `outbox-relay.ts`, `relay-config.ts`; party relay `apps/playground-api/src/parties/party-projection-relay.service.ts` |
| Import engine to copy (read only) | `modules/physical-operations-cmms/apps/api/src/import-export/` |
| Workspace creation | `CreateTenantSchema` in `packages/contracts/src/tenancy/index.ts`; `packages/tenancy-nest/src/`; `apps/workflow-platform/components/platform/PlatformTenantControl.tsx` |
| Starter sets to move into packs | `modules/financial-operations/web/src/FinancialOperationsWorkspace.tsx` (`STARTER_CHART`), `modules/physical-operations-cmms/web/src/components/CmmsWindow.tsx` and `modules/gigaops/web/src/WorkforceWorkspace.tsx` (`STARTERS`) |

## Facts that surprise people

- The reference store is built and checksummed but holds **0 entries** on UAT, and nothing reads it.
- Settings › Localization **does not save** the time zone or currency, and saves the language per user; the workspace has
  no country today. WI-OI-153 adds the workspace profile.
- Units are referenced by `(tenant_id, id)` foreign keys inside Products, so platform units must exist as real
  read-only rows per workspace (ADR-0038 §1).
- `product.created.v1` and its siblings are defined in contracts and never published.
- Country packs `au`, `eu`, `gb`, `in`, `jp`, `us` exist but carry only Workforce rules; Geospatial place types live in
  industry packs.

## Order

Phase 0 now: **WI-OI-152**, **WI-OI-153**, **WI-OI-160**, **WI-OI-156 slice A** (one agent each; they do not share files).
Phase 1 after milestone A: **WI-OI-154** (India and manufacturing first), **WI-OI-155**, **WI-OI-156 slices B–C**.
New module cards wait for milestone B. Phase 2 (WI-OI-159, 158, 157) and phase 3 (WI-OI-162, 161) are confirmed with
the owner card by card before they start.

## Rules you must keep

- Additive only; no cross-module foreign keys; RLS on every new table; permissions in the catalogue; gateway allow-lists;
  `audit:layers` classification; `ui-*` design tokens; the WI-OI-145 screen design (shell tab bar, no page headings,
  underline tabs, plain words).
- Every write path goes through the record dispatcher — packs and imports included — so form rules apply everywhere.
- Statutory pack data names its source and date and is reviewed per country; packs are configuration, not advice.
- Nothing is loaded into an existing workspace until its administrator confirms country and industry.
- Prove on throwaway PostgreSQL and the proof harnesses; UAT is production and read-only to agents.
- **Agents do not deploy** and do not run reference loads on UAT; hand the owner the command.
- Never change the CMMS import/export files, another agent's work, secrets, or the web on port 5180.

## Definition of Done for every card

The card's "Done when" checks; `pnpm verify` green (load compiled modules under Node and run `next build` for web
changes); evidence in `.pi/work/WI-OI-NNN.md`; the WORK_ITEMS row updated (Built, then On UAT naming the release after
the owner deploys); `.pi/NOW.md` updated; a short report to the owner ending with one clear next step.
