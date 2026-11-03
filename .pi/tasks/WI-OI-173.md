# WI-OI-173: Pay by worksite — the place decides the rules; allowances

- **Status:** Proposed (owner, 2026-11-03: added to the queue). Confirm with the owner before it starts. Order: queue
  item 25 in `docs/plans/master-data-foundation-execution-plan.md` §6a (after the country packs).
- **Work item:** WI-OI-173. Evidence goes in `.pi/work/WI-OI-173.md`.
- **Size:** L. **Needs:** WI-OI-154 country packs (statutory content, with each country's reviewer), WI-OI-172 (rates).
  **Review:** a payroll subject-matter reviewer per jurisdiction before any pack is used for real pay.

## Why (evidence, 2026-11-03)

A pay rate is one hourly rate per person, pack and effective date (`SetPayRateV1`,
`packages/contracts/src/workforce/index.ts:1260`); the pack follows the person, not the worksite. Earning categories
are regular, daily overtime and double time, weekly overtime and seventh-day rules (line 1285); there are no
allowances (travel, per diem, night or weekend premium) and no piece rates. The two packs, California and India, are
reference only and refused unless `WORKFORCE_PAY_REFERENCE_PACKS=enabled`
(`modules/gigaops/apps/api/src/pay/pay.rules.ts:16`). A Place's country, region and time zone are optional
(`packages/contracts/src/geospatial/index.ts:74`). A travelling crew paid by a home address would be paid by the wrong
rules.

## Goal

Each worked day is priced by the rules of the place where it was worked; a place used for paid work must name its
country, region and time zone; rates can depend on the job, the site or the customer; allowances are paid by rule.

## Scope

- **May change:** Workforce pay contracts, rules and service (pack chosen per work day from the worksite's
  jurisdiction; rate precedence: customer or contract, then site, then job, then person; allowance rules; additive
  earning categories); validation that a requirement or punch at a place without country, region and time zone cannot
  feed a pay run (shown to the planner first); pack content arrives through WI-OI-154 country packs.
- **Must not change:** approved pay runs (frozen snapshots stay reproducible); reference packs stay off outside local
  and test; the CMMS import/export files; another agent's work.

## Steps

1. Jurisdiction per work day from the booking's place; a missing jurisdiction blocks the run with a plain list.
2. Rate precedence and allowance rules (fixed per shift, per kilometre, per night, percentage premium), each with a
   source and effective dates.
3. Pay run snapshot records the jurisdiction, pack version, rate source and allowance rule per day (verification
   recomputes them as today).
4. Packs: US state rules and India rules come from their country packs with the named reviewer; until then the
   module answers "no approved pack for this place".
5. Tests: a crew working in two states in one week is priced by each state; changing a person's home changes nothing.

## Done when

- [ ] A week across two jurisdictions prices each day by its worksite; allowances appear as their own lines
- [ ] A place without jurisdiction cannot feed a pay run; approved runs still verify
- [ ] Payroll reviewer recorded per jurisdiction used; `pnpm verify` green; evidence in `.pi/work/WI-OI-173.md`

## Stop and ask if

- a jurisdiction needs rules the pack format cannot express (for example union agreements): propose the format first.

## Report

At most five bullets: what changed, the evidence, what is next, and what the owner must decide.
