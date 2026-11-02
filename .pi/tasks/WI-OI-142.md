# WI-OI-142: M-LOTO Digital lockout/tagout and permit-to-work (CMMS M-CM2, web and mobile)

- **Status:** Approved (owner, 2026-11-01: "continue all the modules without my intervention implement everything";
  order confirmed 2026-11-02); In progress on `feat/frontline-suite`.
- **Work item:** WI-OI-142. Evidence: `.pi/work/WI-OI-142.md`. Spec: `docs/products/mobile-suite/04-digital-loto-permit-to-work.md`;
  ADR-0035 (permits belong to CMMS M-CM2; work-order interlock; distinct from SPEED).
- **Size:** L

## Design

- **Data (CMMS migration 33):** `isolation_procedures` (revision per code; points: key, label, energy type,
  isolation tag, method; published by someone other than its author); `permits` (PTW numbers; LOTO, HOT_WORK,
  CONFINED_SPACE, LINE_BREAK, HIGH_VOLTAGE; optional work order and asset; validity ≤ 12 h; DRAFT → ISOLATING →
  AWAITING_APPROVAL → LIVE → DE_ISOLATING → CLOSED, or CANCELLED before LIVE; requester, issuer who authorizes and
  area lead who countersigns are three different people); `permit_isolations` (one per procedure point: lock serial,
  lock photo, try-step zero-energy confirmation with optional witness by someone else, removal during
  de-isolation); `permit_lock_photos` and `permit_lock_events` (personal lock on/off, append-only) and
  `permit_gas_tests` (O₂, LEL, CO, H₂S with limits, append-only).
- **Rules:** every point locked and verified before approval; HOT_WORK and CONFINED_SPACE need an in-limit gas test
  within the last 2 hours; approval refused while a permit sharing an isolation tag is de-isolating (clash);
  personal locks only while LIVE and before expiry; de-isolation starts only when every personal lock is off; close
  needs every lock removed. **Work-order interlock:** a work order with permits starts only while one is LIVE, and
  completes only when every permit is closed or cancelled.
- **Permissions:** `cmms.permits.read|request|lock|authorize|countersign`, `cmms.isolations.manage`. Technician read,
  request, lock; planner read, procedures; new roles Permit issuer (read, authorize, procedures) and Area operations
  lead (read, countersign).
- **Web:** `/cmms/permits` — live isolation board by state, permit detail (points, gas tests, locks, clash warnings,
  authorize, countersign, close), procedure library.
- **Mobile:** `/mobile/v1/permits/...`; feature `permits` (request from a procedure, point-by-point lock with photo
  and try step, gas test entry with flags, personal lock on/off, expiry countdown, de-isolate).

## Gates

Cryptographic multi-party signatures (this build uses authenticated people and four-eyes constraints); P&ID/single-line
diagrams in the procedure library; physical lock hardware integration; push expiry warnings; offline execution;
device proof; owner UAT; Security review.
