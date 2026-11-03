# WI-OI-175: Asset ownership and hire; driver and vehicle checks for fleet

- **Status:** Proposed (owner, 2026-11-03: added to the queue). Confirm with the owner before it starts. Order: queue
  item 22 in `docs/plans/master-data-foundation-execution-plan.md` §6a.
- **Work item:** WI-OI-175. Evidence goes in `.pi/work/WI-OI-175.md`.
- **Size:** M. **Needs:** WI-OI-156 B (partner replicas), WI-OI-171 (vehicle-linked demand).

## Why (evidence, 2026-11-03)

CMMS assets have no ownership or hire fields (the CMMS migrations hold no owned, rented or leased status), so an event
company or contractor cannot tell its own equipment from hired equipment, when hired equipment must go back, or what
it costs. Fleet today is CMMS assets plus the mobile equipment check (WI-OI-139, with groundings); booking a driver
does not check their licence against the vehicle, and a grounded vehicle does not block a booking that needs it.

## Goal

An asset says whether it is owned, rented, leased or customer-owned, from which partner, for which period and at what
cost, with a reminder before it is due back; a booking that needs a vehicle checks the driver's licence and refuses a
grounded vehicle.

## Scope

- **May change:** CMMS assets (additive columns through a new CMMS migration: ownership, owner or lessor partner,
  hire start and end, hire cost and currency); a reminder job; Workforce requirement (optional asset reference) and
  booking guard (licence qualification by vehicle class; grounding from CMMS through a relay fact); mobile equipment
  check shows ownership and return date; tests.
- **Must not change:** the CMMS import/export files (the import kit adds the new columns later through WI-OI-155's
  design); another agent's work; secrets.

## Steps

1. Ownership and hire on assets, shown on the asset and in the Master data area.
2. Return reminders to the asset's owning unit; cost carried for Projects and Finance later (no posting here).
3. Vehicle-linked requirement: the driver needs the licence class; a grounded vehicle cannot be booked (plain reason).
4. Tests and the mobile equipment check display.

## Done when

- [ ] Hired equipment shows its partner, period and cost, with a reminder before return
- [ ] A driver without the licence class, or a grounded vehicle, is refused at booking
- [ ] `pnpm verify` green in both repositories; evidence in `.pi/work/WI-OI-175.md`

## Stop and ask if

- hire cost must post to Finance in the same card (then the Accounting reviewer and a posting rule are needed).

## Report

At most five bullets: what changed, the evidence, what is next, and what the owner must decide.
