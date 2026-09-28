# WI-OI-070 — Policy packs and pay-ready earning lines (roadmap P8, first half)

Status: Review — bounded Local G4 slice (reference packs, rates, runs, earning lines) complete 2026-09-27; owner
decisions, independent reviews, web image certification and human acceptance open  
Owner: SDLC Orchestrator / Workforce Domain / Rules Domain  
Execution: owner continuous mode (WI-OI-062); active after WI-OI-069 entered Review (2026-09-27)  
Requirements: FR-01, FR-04, FR-05, FR-08, FR-10, FR-12; NFR-SEC-001–005, NFR-DATA-001–004, NFR-REL-001–003,
NFR-OBS-001–004  
Independent reviewers: Solution Architecture, Security & Privacy, Backend/Data, API Contracts, QA/SDET, Product,
Finance/Payroll

## Outcome

Payroll receives explainable, payroll-ready earning lines from approved time: each line shows the rule and version
that produced it, and a rerun of the same inputs gives byte-identical results. Roadmap exit (P8 as a whole): golden
tests per rule; sealed reruns identical; post-approval rate changes ignored; exports reconcile 100%. Export and
billing are WI-OI-071 and WI-OI-040.

## G0 — inventory

- **Approved time exists.** WI-OI-069 gives immutable approved weekly timesheets with lines (worked and break
  minutes per shift) in `gigalibs_workforce`.
- **Prototype payroll engine** `modules/gigaops/apps/api/src/payroll/payroll-engine.ts` (not mounted):
  - pay types `10ST`, `9ST_OT9`, `8ST_8OT` (California daily 8/12 and the seventh-day rule), `INDIA_48` (9 h/day,
    48 h/week, 2×) and flat daily/weekly/event rates;
  - it uses floating-point money, `Date` objects and hard-coded configurations.

  Its rule shapes are reusable; its arithmetic is not.
- **Universal Rule Pro** (WI-OI-024, Review) has its own API (port 3900) and schema, but it is not in the local
  Compose profile. `@gigalibs/rule-engine-universal` was promoted out of quarantine (WI-OI-054).
- **Multi-currency** (WI-OI-057, Review) supplies currency references.
- **Integrity chain (ADR-0012):** not written. The other stream's unregistered forms work adds a control-plane
  migration `20260927000000_ledger_genesis_records`. The roadmap says `ledger_genesis_records` is replaced by the
  Delta 5 integrity chain (ADR-0012). This conflict needs an owner decision; this item does not touch that work.
- **Rates:** no pay rate model exists in the canonical Workforce runtime.

## G1 — decisions (recommended defaults; owner to confirm)

1. **First jurisdiction and named client (owner).** Until named, the build ships two **reference packs** derived
   from the prototype's rule shapes. They are labelled "reference, pending payroll SME validation" and are not
   statutory advice:
   - `US-CA-OT` (daily 8/12, weekly 40, seventh-day);
   - `IN-48` (daily 9, weekly 48, 2×).
2. **Where packs live (ADR-0008, Proposed).**
   - Packs are versioned, effective-dated documents stored in Workforce. They are evaluated by one pure,
     deterministic calculator, so reruns are identical and post-approval changes cannot leak in.
   - Universal Rule Pro becomes the authoring and approval surface for packs once it joins the local profile. The
     frozen pack version id is the contract between them.
3. **Money and precision:** integer minor units, a currency code per rate, and explicit half-even rounding per line.
   Hours are counted in whole minutes. No floating point in results.
4. **Rates:** effective-dated pay rates per person (hourly amount, currency, pack). A calculation freezes the rate
   and pack version that were in force; later rate changes never alter an approved run.
5. **Runs:**
   - a calculation run covers approved timesheets for one week and is idempotent by request key;
   - it stores earning lines (regular, daily overtime, double time, weekly overtime, seventh-day) with a rule trace
     and a SHA-256 content digest;
   - approve, lock, reopen and correct need two people (separation of duties).
6. **Seal (deferred to ADR-0012).** The run digest makes "rerun identical" testable now. Anchoring the digest in
   the tenant integrity chain waits for the owner's ADR-0012 decision.

## G2 — design (outline)

- **Migration** `000011_workforce_pay_readiness`:
  - `pay_policy_packs` (code, version, effective window, JSON rules, status);
  - `pay_rates` (person, effective window, amount in minor units, currency, pack code);
  - `pay_runs` (week, status, request key, digest, pack and rate snapshot);
  - `earning_lines` (append-only).
  - Forced RLS; an immutability trigger for locked runs.
- **Calculator** `pay/pay.rules.ts`: pure. Input: timesheet lines by day, a pack version and a rate. Output:
  earning lines with a trace. Golden tests per rule and per reference pack.
- **Routes** `v1/pay-packs`, `v1/pay-rates`, `v1/pay-runs`, plus approve, lock and reopen. Permissions
  `workforce.pay.read`, `workforce.pay.manage`, `workforce.pay.approve`.
- **Screen:** GigaOps → Pay-ready outputs (the section already exists as planned).

## G4 — built

- **Workforce migration** `000011_workforce_pay_readiness` (contract 11):
  - `pay_rates`: an exclusion constraint forbids overlapping windows per person;
  - `pay_runs`: request key; one live run per week; `approved_by <> calculated_by`; an immutability trigger once
    approved;
  - `earning_lines`: append-only through the runner.
- **Pure calculator** `pay/pay.rules.ts`:
  - reference packs `US-CA-OT@1` and `IN-48@1`;
  - BigInt minor units with half-even rounding per line;
  - regular, daily overtime and double time, weekly overtime and the seventh-day rule;
  - a rule trace per line and a canonical SHA-256 run digest.
- **`PayService` and routes:**
  - `v1/pay-packs`, `v1/pay-rates` (list, set from a date);
  - `v1/pay-runs` (calculate, list, detail, `verification`, approve, void).
  - Permissions: `workforce.pay.read|manage|approve`. Place-scoped members are refused (pay is tenant-wide).
- **BFF and web:**
  - the pay routes are allow-listed;
  - GigaOps → Pay-ready outputs (Medusa UI): packs with a reference badge, rate history, runs with traced lines,
    approve/void, and a reproducibility check.
- **Records:** ADR-0008 (Proposed).

## Certification — identity `5abfa667bb10-8ba0e4452554`

- **Chain:** build, test (214 files / 1,883 tests), six audits, identity, Workforce and module images — exit 0.
  Workforce is deployed at schema 11.
- **`verify-workforce-pay.sh`** (new) passed on week 2026-08-31, entered as corrections and approved four-eyes:
  - 15 golden lines, USD 1,040.00 and INR 12,000.00, with the seventh-day and weekly-overtime traces;
  - a missing rate refused; overlapping and back-dated rates refused;
  - replay; one live run; self-approval refused;
  - void and an identical recalculation; approval final;
  - a mid-week rate change after approval leaves the run and its verification unchanged;
  - scope and tenant B refused; restart persistence;
  - earning lines append-only; the approved run immutable for the runtime role and the owner; lines reconcile
    to totals.
- **Regression passed:** time, the Workforce suites and the handshake.
- **Unit:** 11 golden calculator tests and the BFF pay route test.
- **Image policy** `infra/compose/evidence/wi-oi-070-20260927T150757Z`: 0 Critical, 0 High.

## Open

- **Owner:** the first jurisdiction and its named client. The reference packs are not statutory advice.
- **Owner:** ADR-0012 integrity chain versus the unreviewed `ledger_genesis_records`. Anchoring the run digest
  waits for this.
- **Authoring:** Universal Rule Pro authoring of new pack versions (ADR-0008 §5).
- **Web image certification** of the Pay-ready outputs screen (blocked by the forms work).
- **Next (P8):** WI-OI-071, export to payroll and ERP through Connector Hub with reconciliation.

## Product Owner acceptance run

1. For a past week, enter or approve timesheets for two people (Clock & timesheets).
2. Pay-ready outputs: set rates for both people, one on `US-CA-OT` and one on `IN-48`.
3. Calculate the week. Check the lines, the rule trace and the totals.
4. Void the run and calculate it again: the digest is identical.
5. A second manager approves the run. Change a rate afterwards, then use "Check reproducibility": the result is
   identical.

## Production readiness (2026-09-27)

Not production ready; still in Review. See `docs/reviews/production-readiness-WI-OI-068-071-2026-09-27.md`.
Production hardening was re-certified on `5abfa667bb10-7d322fbdc9dd` (CMMS and Workforce schema 13):

- reference pay packs are off unless a profile enables them;
- relay functions are executable only by their own module's runtime role;
- the backup/restore drill passed (`verify-module-restore.sh`);
- the relay-outage drill passed (`verify-cmms-workforce-relay-outage.sh`);
- the full regression passed.

Open: independent review, E2E/WCAG (web image), UAT, frozen source, release authority and the owner decisions.

