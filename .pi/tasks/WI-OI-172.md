# WI-OI-172: Customer and rate on demand; one time path from Workforce to Projects billing

- **Status:** Proposed (owner, 2026-11-03: added to the queue). Confirm with the owner before it starts. Order: queue
  item 19 in `docs/plans/master-data-foundation-execution-plan.md` §6a.
- **Work item:** WI-OI-172. Evidence goes in `.pi/work/WI-OI-172.md`.
- **Size:** L. **Needs:** WI-OI-171 (declared sources), WI-OI-157 (people linked), WI-OI-156 B (partner replicas).
  **Review:** Accounting (billing).

## Why (evidence, 2026-11-03)

Workforce demand has no customer, contract or bill rate. Project Operations has projects with a customer
(`customer_party_id`) and owning unit, labor rate codes (`labor_rates`), its own timesheets per user, task and day
(`timesheets`, `DRAFT → SUBMITTED → APPROVED → BILLED`) and billing to AR (`project_billing_requests`; relay
`projects-to-ar`). The two time systems are not connected: no relay between them, and the `PROJECT` requirement source
is never produced. A staffing agency, a security agency or an event company would record verified shift time in
Workforce and re-type it in Projects to bill it.

## Goal

A project (an event, a client contract, a security post contract) asks Workforce for people; booked shift time,
approved in Workforce from real punches, flows to the project for billing at the contract rate; office task time keeps
using Projects' own timesheets.

## Scope

- **May change:** Workforce requirement and booking (optional customer party and project task reference, a bill rate
  code snapshot; additive); a relay Projects → Workforce (staff request for a task) and Workforce → Projects (approved
  booked time), declared in `config/relay-wiring.json` and checked by `audit:relays`; Project Operations inbox writing
  billable time lines; tests and journey steps.
- **Must not change:** Projects' existing manual timesheets and billing; the CMMS import/export files; another agent's
  work; secrets.

## Steps

1. Decide with the owner (recommended): Workforce is the system of record for booked shift time; Projects keeps task
   time for office work; one approved hour is billed once.
2. Projects task → staff request (source `PROJECT`, customer and rate code carried).
3. Approved Workforce timesheet lines for those bookings → Projects billable lines at the rate code in force on the
   work date; idempotent by timesheet line.
4. Billing from Projects to AR unchanged; AR must run on UAT (completion stage C5) for the last step.
5. Proof on a throwaway database (`proof:minimal-o2c` style): booked, punched, approved, billed, invoiced, once.

## Done when

- [ ] An event's crew time goes from punches to an AR invoice without re-typing, billed once at the contract rate
- [ ] Relays declared and `audit:relays` green; Accounting review recorded; `pnpm verify` green
- [ ] Evidence in `.pi/work/WI-OI-172.md`

## Stop and ask if

- a customer needs different rates per worker grade, overtime billing or minimum call-out hours (rate rules), or
  workers shared across customer workspaces (a separate design).

## Report

At most five bullets: what changed, the evidence, what is next, and what the owner must decide.
