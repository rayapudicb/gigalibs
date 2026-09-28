# WI-OI-062 - Operations convergence programme

Status: Proposed  
Gate: G0–G2 programme governance (no Build authority)  
Owner: SDLC Orchestrator / Product Owner  
Requirements: FR-01, FR-02, FR-04–FR-06, FR-08–FR-16; NFR-GOV-001–003, NFR-SEC-001–005,
NFR-DATA-001–004, NFR-REL-001–003, NFR-PERF-001–003, NFR-OBS-001–004, NFR-UX-001–004, NFR-OPS-001–004

## Outcome

One recorded, gated sequence that takes GigaOps from the WI-OI-061 resource/capability vertical to the
vision of a configurable, any-industry operations product: place, people, work, time and rules, money,
insight, industry templates and edge scale. The sequence is
`docs/plans/gigaops-convergence-roadmap.md` (revision 2).

## Scope

- Maintain the roadmap, its phase order, milestones (M1–M4) and Delta 5 adopter proposals.
- Allocate and register the per-phase work items (`WI-OI-063` onward) only when each reaches G0.
- Reserve ADR-0006 to ADR-0012 and track their decisions.
- Run the P1 governance actions: Review-queue triage, weekly review slot, named independent reviewers,
  ADR-0003 acceptance including permission naming.

## Explicit exclusions

- No product code, migration or deployment change is authorized by this item.
- It does not change the status of any other work item; `.pi/WORK_ITEMS.md` remains canonical.
- It does not supersede Delta 5 (`WI-OI-044` to `WI-OI-047`); GigaOps adopts Delta 5 contracts.

## Owner decisions recorded — 2026-09-26

- Adopt the proof-first order (P3 configurability proof on isolated synthetic data).
- Tamper-evident audit through the Delta 5 integrity chain (ADR-0012), not a standalone ledger table.
- No general ledger in this programme; reconciled AR/AP plus ERP export.
- Ten industry templates: nine existing packs plus agriculture and harvesting.
- `CREW` → `TEAM` and `workforce:*` for `TENANT_ADMIN`, delivered under WI-OI-061.

## Owner decisions recorded — 2026-09-26 (later)

- **Execution mode: continuous.** The owner directed completion of all phases. Each phase enters Review when
  its evidence is complete and the single Build slot passes immediately to the next phase; the owner
  reviews in parallel. Human acceptance, independent review, G5 UAT and G6–G7 release remain open until
  named humans sign them. This is the standing Build handoff for P2 onward.
- **P8 first jurisdiction: India** (country pack `IN` exists).
- **P2 spatial scope enablement: per-tenant opt-in**, off by default.
- **P4 CMMS access: grant `cmms:*` to `TENANT_ADMIN` after CMMS core certification.**
- Geospatial Studio contained now (delivered in WI-OI-061) and certified through WI-OI-063.

## Next handoff

Owner and SDLC Orchestrator confirm the programme, triage the Review queue and hand the next sole Build
slot to `WI-OI-063` (Place) after WI-OI-061 enters Review.

## Owner decisions recorded — 2026-09-26 (P2 scope)

- **GeofenceZone retirement:** drop the control-plane `geofence_zones` table and model; the two local demo
  rows (`warner-bros`, "Soundstage 4") are backed up to `infra/compose/backups/` first. Geospatial places
  with boundaries are the single geofence owner.
- **Japan pack:** moved from P2 to P3. Country packs (with ISO 3166-2 jurisdiction codes) are built once as
  Configuration Studio definitions where the `jp-metro-industrial` benchmark first consumes them, instead of
  extending the undeployed `modules/gigaops` JSON packs.

## Owner decision recorded — 2026-09-26 (P3 metadata ownership)

- **Metric catalogue, industry packs and country packs live in Configuration Studio.** Configuration Studio is
  extended with typed definition kinds under its change set → approval → publish → activation lifecycle, keeping
  one metadata engine (roadmap rule 3); Analytics is the D1 adopter that consumes them. Accepted cost: about 1–2
  weeks added to P3.
