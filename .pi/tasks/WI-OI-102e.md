# WI-OI-102e: catalogue truth and module triage (ADR-0016 F6; vision §5)

- **Status:** Done (2026-09-29). The owner approved the triage table and the locking of frozen modules. Evidence is in
  `.pi/work/WI-OI-102.md` under "102e".
- **Work item:** WI-OI-102.
- **Size:** M.

## Goal

Every catalogue entry shows its real maturity, nothing uncertified is advertised as available, and each code-only
module has an owner-approved outcome.

## Done

- [x] The `maturity` field (six states) is in the contract, the manifests, the validator, the generator and the
      screens.
- [x] No entry is AVAILABLE without certification, and the reasons are rewritten to what exists.
- [x] Triage: 3 modules kept, 1 merging, 10 frozen and locked.
- [x] Chart-gallery counts come from data.
- [x] `pnpm verify` passes, and `.pi/NOW.md` is updated.
