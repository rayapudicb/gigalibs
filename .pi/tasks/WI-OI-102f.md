# WI-OI-102f: package inventory and clean-up (ADR-0016 F7)

- **Status:** Done (2026-09-29). The owner approved the recommended batches A–D and the Master Data lock. Evidence is
  in `.pi/work/WI-OI-102.md` under "102f".
- **Work item:** WI-OI-102.
- **Size:** M.

## Done

- [x] Batches A–D removed; `pnpm verify` passed after each.
- [x] Locked modules are refused at the API as well as on screen; Master Data is locked.
- [x] The Python plane is parked (out of `pnpm test`, with `PARKED.md`).
- [x] The quarantine registry and workspace exclusions keep only TextFly.
- [x] The layer baseline has 20 entries; the docs and ADR-0013 are updated.
