# WI-OI-070 Pay policy packs and earning lines review request (roadmap P8, first slice)

Date: 2026-09-27  
Profiles: `configuration-local-development-v1` with the Workforce, Geospatial and modules overlays  
Decision requested: bounded Local Development G4 review; owner decisions (below); Product Owner acceptance

## Implemented outcome

Approved time becomes explainable, reproducible earning lines:

- **Policy packs.** Two built-in reference packs are versioned and effective-dated. They are marked as
  reference, not statutory advice:
  - `US-CA-OT@1`: daily 8/12 hours, weekly 40, seventh consecutive day;
  - `IN-48@1`: daily 9, weekly 48, 2×.
- **Pay rates.** Rates are dated per person, with a pack and a currency. A new rate closes the previous one the day
  before. Overlapping or back-dated rates are refused.
- **Weekly runs** over approved timesheets:
  - earning lines by day and category, each with a rule trace;
  - exact integer money with half-even rounding;
  - totals per currency and a SHA-256 digest;
  - request-key replay and at most one live run per week.
- **Controls:**
  - four-eyes approval, with approval final in the database;
  - void and recalculate before approval;
  - "Check reproducibility" recomputes from the frozen inputs, so later rate changes never alter an approved run.
- **Screen:** GigaOps → Pay-ready outputs (Medusa UI).

## Exact evidence identity

| Artifact | Identity |
| --- | --- |
| Workforce image | `gigalibs/workforce-api:5abfa667bb10-8ba0e4452554` (schema contract 11) |
| CMMS image | `gigalibs/cmms-api:5abfa667bb10-811bff4d48da` (unchanged) |
| Other services | unchanged at `5abfa667bb10-7507432cb066` |
| Image policy | `infra/compose/evidence/wi-oi-070-20260927T150757Z`: 0 Critical, 0 High |

## Measured result

- **Chain:** build; tests (214 files, 1,883 tests); the six audits; identity; Workforce and module images. All
  pass.
- **`verify-workforce-pay.sh`** passes:
  - 15 golden lines totalling USD 1,040.00 and INR 12,000.00;
  - an identical recalculation after a void;
  - a post-approval rate change ignored;
  - immutability for the runtime role and the schema owner;
  - lines reconciled to totals;
  - scope and tenancy refusals.
- **Regression:** the time and Workforce suites and the CMMS handshake pass.

## Owner decisions required

1. **The first jurisdiction and its named client.** Until then, the reference packs stay labelled and must not be
   used for real pay.
2. **ADR-0012 integrity chain.** The other stream's unreviewed control-plane migration `ledger_genesis_records`
   conflicts with the roadmap, which replaces it with the Delta 5 integrity chain. Run digests are anchored once
   this is decided.
3. **ADR-0008:** accept packs as versioned documents evaluated by one pure calculator, with Universal Rule Pro as
   the future authoring surface.

## Review decisions required

1. **Finance/Payroll:** the golden scenarios, the category order (daily before weekly), and rounding per line.
2. **Security & Privacy:**
   - pay rates stored per person;
   - tenant-wide scope for pay;
   - `workforce.pay.approve` separation of duties.
3. **Backend/Data:** the immutability trigger, the rate exclusion constraint, and the frozen snapshot.
