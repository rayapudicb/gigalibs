# WI-OI-072 — Live intelligence and the first business outcome (roadmap P9, milestone M2)

Status: In Progress (G0 inventory and G1 options recorded; build waits for the decisions below)  
Owner: SDLC Orchestrator / Analytics / Workforce / Maintenance  
Execution: owner continuous mode (WI-OI-062); active after WI-OI-071 entered Review (2026-09-27)

## Outcome

Managers see real coverage, overtime, cost and margin with lineage and freshness, and the nine-step journey runs
end to end. Exit: nine steps pass; every metric traces to source facts; no open P0/P1 defect; the owner accepts.

## G0 — inventory

- **Analytics fact store** (P3, WI-OI-064): `gigalibs_analytics.operational_facts`.
  - Fact types: `LABOUR_HOURS`, `LABOUR_COST`, `SPEND`, `DOWNTIME_MINUTES`, `CARBON_KG`.
  - Each fact is keyed by place with its **ltree place path at event time**. It is idempotent on
    `(tenant, source, source_event_id)` and has origin `LIVE` or `SYNTHETIC`.
  - Place rollups are rebuilt from the facts. Only the Demo Lab writes facts today, and those are synthetic.
- **Producers are ready:**
  - Workforce: approved timesheet lines (worked minutes per site) and approved pay runs (earning lines per
    currency), with Delta 5 outbox facts;
  - CMMS: work-order labour and completion facts.
  - The ADR-0007 relay pattern (per-module relay, body-bound tokens, keyed receipts, per-key FIFO) is proven.
- **Gap — place paths.** Producers hold only the place id (`site_ref`). Analytics needs the path at event time.
  Geospatial owns the paths, but it has no fact relay, and it cannot be rebuilt without shipping the other
  stream's unreviewed `mobile/sync` and `lookup/tag` routes.
- **The Analytics source is unchanged** since its certified image (`7507432cb066`), so it can be rebuilt safely.
- **The nine-step journey and G5 evidence** (E2E, WCAG 2.2 AA, restore, UAT) need the web image, which the
  unregistered forms work blocks.

## G1 — options for place paths (ADR-0009 to be written; recommendation first)

1. **Recommended: Geospatial publishes place facts to Analytics through the ADR-0007 relay.** Analytics keeps a
   place-path projection with validity windows and stamps each incoming fact with the path valid at its event
   time. It is clean ownership and history-correct. It needs a Geospatial rebuild, so the owner must first review
   or remove the other stream's Geospatial changes.
2. **The BFF composes paths at read time.** Facts carry only the place id, and the BFF joins current paths from
   Geospatial. No Geospatial change is needed, but history is re-attributed when places move, and the fact store's
   rollup design is bypassed.
3. **Producers keep their own place-path projection.** Each producer would duplicate Geospatial data; not
   recommended.

## Owner decisions needed

1. Choose the place-path option (1 recommended), and decide what happens to the other stream's Geospatial
   changes (review, keep or remove).
2. Unblock the web image (register or remove the forms work) for the nine-step journey and G5 evidence.
3. Name the tenant for the Product Owner UAT (a real, isolated local tenant).

## Next build steps once decided (option 1)

- Geospatial relay of `PLACE_CREATED/MOVED/RENAMED` facts into an Analytics `place_paths` projection with
  validity windows.
- Workforce and CMMS relays to the Analytics inbox:
  - approved timesheet lines → `LABOUR_HOURS`;
  - approved earning lines → `LABOUR_COST`;
  - CMMS completed work orders and downtime → `DOWNTIME_MINUTES`.

  Source event ids come from the producer line ids.
- Freshness per source (last fact time) and a lineage node per metric.
- Certification: replay without duplicates, a place moved after the fact keeps its history, tenant isolation, and
  every metric traced to source lines.
