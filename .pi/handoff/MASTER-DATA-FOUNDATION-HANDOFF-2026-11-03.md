# Hand-over to any agent developer — Master Data Foundation and Platform Kit

**From:** Claude (WI-OI-145–151 session), 2026-11-03. **Owner decision:** solve master data and the platform's
developer foundations **before** further modules are built or enhanced; follow the recommendations (ADR-0037–0040);
country order India, Japan, USA, Middle East, Europe, then China, Russia, Africa — and every other country must work
from day one.

## Read first (in this order)

> **2026-11-03:** the queue now also holds the module completion cards WI-OI-167–175; start from
> [`ALL-MODULES-COMPLETION-HANDOFF-2026-11-03.md`](ALL-MODULES-COMPLETION-HANDOFF-2026-11-03.md), which links back here for
> the rules and the Definition of Done.

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

## Order — one queue, one card at a time

Follow **§6a "The one ordered queue"** in `docs/plans/master-data-foundation-execution-plan.md`. There is no
parallel work: whoever is working (Claude, Codex or another agent) takes the first unfinished item, claims the single
active slot, finishes it, then moves on. Cards WI-OI-163–166 (record-level actions, mobile CMMS work, frontline device
proof, request → several work orders) came from the review of the mobile capability atlas and sit in that queue.

## Taking over from another agent (for example Codex when Claude's session ends)

1. Work in `~/dev/gigalibs-rounds` on branch `feat/frontline-suite`. Do **not** read status from `~/dev/gigalibs`:
   it is an older release line, and reading it made the mobile atlas think the frontline producers did not exist.
2. Read `.pi/NOW.md` (what is current) and §6a (what is next).
3. Look at `config/sdlc-governance.json` → `workInProgressLimits.activeImplementationWorkItems`:
   - one id listed: that card is being built — continue it only if NOW.md says its owner stopped; otherwise wait;
   - empty: claim the first unfinished item (its row In Progress with your name, its id in the slot).
4. Mobile code goes in `~/dev/gigalibs_mobile` only as part of the card that names it.
5. Finish exactly as the card says, then hand the owner one clear next step. No deploys; commit only on the owner's
   "commit".

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
