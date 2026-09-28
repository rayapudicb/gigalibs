# ADR-0008: Pay policy packs and deterministic earning lines

- Status: Proposed. Built as a bounded local slice under WI-OI-070 with recommended defaults; the owner confirms
  the first jurisdiction and its named client.
- Date: 2026-09-27
- Programme: WI-OI-062, phase P8
- Related: ADR-0003 (Workforce owns people and time), ADR-0005 (Delta 5 evidence), ADR-0012 (integrity chain, not
  yet written), WI-OI-069 (immutable approved timesheets), WI-OI-024 (Universal Rule Pro), WI-OI-057
  (multi-currency)

## Context

Payroll needs earning lines it can trust. Each line must show which rule, version and rate produced it; it must
never change after approval; and recalculating the same inputs must give identical results. The prototype engine
encodes useful rule shapes (California daily 8/12 hours with the seventh-day rule; India 9 h/day and 48 h/week at
2×), but it uses floating-point money and hard-coded configurations. Universal Rule Pro can author policies but is
not part of the local runtime.

## Decision

1. **Packs are versioned, effective-dated rule documents** with a code, a version, a jurisdiction label and a
   `reference` flag.
   - The first build ships two built-in reference packs, `US-CA-OT` v1 and `IN-48` v1. They are marked
     "reference, pending payroll SME validation" until a named client's jurisdiction is confirmed and validated.
   - A pack version never changes; a change is a new version.
2. **One pure calculator** turns a person's approved week (worked minutes per day) plus the pack version and rate
   in force each day into earning lines:
   - regular;
   - daily overtime and daily double time;
   - weekly overtime (regular time beyond the weekly limit only, since daily overtime never counts twice);
   - seventh-consecutive-day overtime and double time.

   Money is integer minor units, computed exactly and rounded half-even once per line. Multipliers are basis
   points. There is no floating point.
3. **Runs freeze their inputs.**
   - A run records the timesheets it used, each person's rate and pack version, and a SHA-256 digest of its
     canonical lines.
   - A later rate or pack change never alters an approved run. Verification recomputes from the frozen inputs
     and must reproduce the digest.
4. **Separation of duties.**
   - Calculating and approving need different people.
   - An approved run cannot change: the database refuses it for every role.
   - A calculated run can be voided and recalculated. There is at most one live run per week.
5. **Authoring (later).** Universal Rule Pro becomes the authoring and approval surface for new pack versions. The
   frozen `code@version` is the contract, so moving authoring does not change calculation.
6. **Seal (later).** The run digest is anchored in the tenant integrity chain once ADR-0012 is decided. Until then
   the digest and the database immutability are the evidence.

## Consequences

- "Sealed reruns identical" and "post-approval rate changes ignored" are testable now. Anchoring waits for
  ADR-0012.
- Reference packs are not statutory advice. Using them for a real payroll requires the named client's
  jurisdiction and SME validation of golden tests.
- Export to payroll and ERP (WI-OI-071) and billing (WI-OI-040) consume approved runs.

## Open questions for the owner

1. The first jurisdiction and the named client.
2. ADR-0012: the per-tenant integrity chain, versus the other stream's unreviewed `ledger_genesis_records`
   migration.
