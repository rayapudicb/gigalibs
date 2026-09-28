# WI-OI-071 Pay export and reconciliation review request (roadmap P8, second slice)

Date: 2026-09-27  
Decision requested: bounded Local Development G4 review; owner decision on the payroll/ERP target; Product Owner
acceptance

## Implemented outcome

An approved pay run becomes a payroll file whose delivery can be proven:

- **The export (`PAYROLL_CSV_V1`).**
  - One row per earning line: person reference and name, date, category, minutes and hours, multiplier, rate,
    amount, currency, pack and rule trace.
  - RFC 4180 quoting, with formula cells neutralised.
  - There is one export per run. It is immutable and never deleted, and its SHA-256 is the download ETag.
- **Reconciliation.** Re-reads the stored file and matches every line and every currency total against the run.
- **Confirmation.** The payroll target's batch reference, line count and totals must match exactly, and another
  person must confirm them. Refused attempts are kept as audit evidence.
- **Screen:** GigaOps → Pay-ready outputs → payroll export panel on approved runs.

## Exact evidence identity

| Artifact | Identity |
| --- | --- |
| Workforce image | `gigalibs/workforce-api:5abfa667bb10-173c70f53e51` (schema contract 12) |
| Image policy | `infra/compose/evidence/wi-oi-071-20260927T152200Z`: 0 Critical, 0 High |

## Measured result

- **Chain:** build; tests (215 files, 1,888 tests); the six audits; identity; images. All pass.
- **`verify-workforce-pay.sh`** (pay and export) passes, with its database checks.
- **Regression:** the Workforce suites, time, the CMMS handshake and the punch baseline (29,685/min at 64 in
  flight) pass.
- **Defect found in certification and fixed:** a second mismatched confirmation returned 500.

## Owner decisions required

1. The payroll or ERP target and its import format. Delivery through Connector Hub follows; it is inbound-only
   today.

## Review decisions required

1. **Finance/Payroll:** the file layout and control totals.
2. **Security & Privacy:**
   - pay data in the export file;
   - formula-injection neutralisation;
   - separation of duties on confirmation.
3. **Integration:** the Connector Hub outbound design, once a target is named.
