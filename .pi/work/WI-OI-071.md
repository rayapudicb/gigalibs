# WI-OI-071 — Pay export and reconciliation (roadmap P8, second slice)

Status: Review — bounded Local G4 slice (canonical export, reconciliation, confirmed import) complete 2026-09-27;
target system, Connector Hub delivery, web image certification and human acceptance open  
Owner: SDLC Orchestrator / Workforce Domain / Integration  
Execution: owner continuous mode (WI-OI-062); active after WI-OI-070 entered Review (2026-09-27)

## Outcome

Approved pay runs reach payroll or an ERP as a reconciled export: every earning line is delivered exactly once,
and the export's totals are proven to match the run (100% reconciliation) before it is marked delivered.

## G0 — inventory

- Connector Hub (WI-OI-059) is inbound only. It has connections, OAuth, delta sync into a raw ingestion journal,
  and webhooks. It has no outbound delivery of files or payloads.
- WI-OI-070 gives approved, immutable pay runs with traced earning lines and per-currency totals.
- The payroll or ERP target system and its import format are not named (owner decision).

## G1/G2 — decisions (recommended; owner to confirm)

1. **Canonical export first.** From an APPROVED run, Workforce produces `PAYROLL_CSV_V1`:
   - one row per earning line: person reference, name, date, category, minutes, hours, multiplier, rate, amount,
     currency, pack, rule trace;
   - RFC 4180 quoting, with cells neutralised against formula injection;
   - a control manifest: line count, totals per currency and the file's SHA-256.

   There is one export per run and format (idempotent), and its content is immutable.
2. **Reconciliation.** `GET v1/pay-exports/:id/reconciliation` re-parses the stored file and compares the line
   count, every amount and the per-currency totals with the run (100%).
   `POST v1/pay-exports/:id/acknowledge` records the target's batch reference and reported control totals. It only
   succeeds when they match exactly; a mismatch is refused and audited.
3. **Delivery through Connector Hub waits for the target system.** An outbound capability in Connector Hub is a
   separate change there.
4. **Permissions:** `workforce.pay.read` (export, file, reconciliation), `workforce.pay.manage` (create,
   acknowledge). The acknowledger must differ from the exporter.

## G4 — built

- **Workforce migration** `000012_workforce_pay_exports` (contract 12): `pay_exports`.
  - There is one export per run and format.
  - A trigger keeps the content, digest, count, totals, run and format immutable. An acknowledged export is final,
    and exports are never deleted.
  - Database checks: confirmation needs a target reference, and `acknowledged_by <> created_by`.
- **Pure rules** `pay/pay-export.rules.ts`:
  - `PAYROLL_CSV_V1`, with RFC 4180 quoting and formula-injection neutralisation;
  - currency-exponent money formatting and parsing;
  - an RFC 4180 parser;
  - line-by-line and total reconciliation.
- **`PayExportService` and routes:**
  - `POST v1/pay-runs/:id/exports` (approved runs only; replay returns the existing export);
  - `GET v1/pay-exports`, `v1/pay-exports/:id`, `…/file` (`text/csv`, ETag = SHA-256), `…/reconciliation`;
  - `POST …/acknowledge`, which checks the target's reported line count and totals. A mismatch is refused, and each
    refused attempt is kept as audit evidence.
- **BFF:** the export routes are allow-listed, and the proxy passes `Content-Disposition` through for downloads.
- **Screen:** Pay-ready outputs gains a payroll export panel on approved runs: create, download, reconcile, and
  confirm the import with the reported totals.

## Certification — identity `5abfa667bb10-173c70f53e51`

- **Chain:** build, test (215 files / 1,888 tests), six audits, identity, images — exit 0. Workforce is at schema
  12.
- **`verify-workforce-pay.sh`** (pay and export) passed:
  - an export of a voided run is refused;
  - the export is created once, and replay returns it;
  - the downloaded file's SHA-256 equals the stored digest and the ETag;
  - it has 16 rows (header plus 15), with the seventh-day line present;
  - reconciliation passes line by line;
  - confirmation by the creator is refused (403); a short import and a wrong total are refused (409) and audited
    (2);
  - a second person confirms, the export becomes final, and tenant B is refused;
  - in the database, a runtime-role rewrite and an owner delete are refused.
- **Defect found and fixed:** the second refused confirmation returned 500 (outbox unique key). Refusals are now
  audit-only, and the fix was re-certified.
- **Regression:** the Workforce suites, time and the handshake pass. Baseline 29,685/min at 64 in flight.
- **Image policy** `infra/compose/evidence/wi-oi-071-20260927T152200Z`: 0 Critical, 0 High.

## Open

- **Owner:** the payroll or ERP target and its import format.
- **Delivery through Connector Hub:** an outbound capability, a separate change in Connector Hub.
- **Web image certification** (blocked by the forms work).

## Product Owner acceptance run

1. Pay-ready outputs: open an approved run, then choose "Create payroll export" and download the CSV.
2. Open it in a spreadsheet. Names that start with `=` show as text, and the amounts match the run.
3. Choose Reconcile: it reports a match.
4. As another manager, confirm the import with a batch reference, the line count and the totals. A wrong total is
   refused.

## Production readiness (2026-09-27)

Not production ready; still in Review. See `docs/reviews/production-readiness-WI-OI-068-071-2026-09-27.md`.
Production hardening was re-certified on `5abfa667bb10-7d322fbdc9dd` (CMMS and Workforce schema 13):

- reference pay packs are off unless a profile enables them;
- relay functions are executable only by their own module's runtime role;
- the backup/restore drill passed (`verify-module-restore.sh`);
- the relay-outage drill passed (`verify-cmms-workforce-relay-outage.sh`);
- the full regression passed.

Open: independent review, E2E/WCAG (web image), UAT, frozen source, release authority and the owner decisions.

