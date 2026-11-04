# WI-OI-176: Reference data you can see — a read-only viewer, the operator's versions, and a right "No access"

- **Status:** Built (2026-11-04). Order: queue item
  9a in `docs/plans/master-data-foundation-execution-plan.md` §6a, after WI-OI-164.
- **Work item:** WI-OI-176. Evidence goes in `.pi/work/WI-OI-176.md`.
- **Size:** M. **Decisions:** ADR-0038 (platform reference data is read-only for workspaces; the platform loads new
  versions).

## Why (evidence, 2026-11-04, release `ef8d7dad`)

- In the Master data area, "Open" on Countries, Currencies, Languages and Time zones goes to Settings › General (where
  the workspace picks its own country), not to the reference entries. No screen lists the reference sets.
- The platform operator loads reference data only by command (`apps/playground-api/src/platform-reference-load.ts`).
- The control plane's set route (`GET /api/v1/platform-reference/{set}`) is not reachable through the web.
- Some logins see "No access" on masters in the hub while the workspace admin sees their counts. A row is listed only
  when the session holds the read permission, so "No access" means the module refused a person the screen thought
  could read — a mismatch to find.

## Goal

Anyone in the workspace can look up the reference data read-only; the platform operator can see each set's versions
and load a new one from the screen; the hub's state is right for every login.

## Scope

- **Viewer:** a read-only screen per set (search, list, one entry's details such as a country's currency, calling code,
  week start and measurement system; the version, source, checksum and load date), reached from the Master data area.
  A member-readable web route over the control plane's set route.
- **Registry:** the reference rows' "Open" goes to the viewer.
- **Operator:** in the platform operator area, each set's versions and a "load new version" action over the same service
  as the command (checksum, audit, reason), refused to anyone else.
- **"No access":** reproduce with the login that saw it; fix the cause (session permissions versus the module's signed
  context, or the hub's own check) and make the state say why (not permitted, module off, or not answering).
- **Must not change:** workspaces never edit platform reference data; their own values stay in module masters (units in
  Products, tax codes and payment terms from packs, WI-OI-154). The CMMS import/export files; another agent's work.

## Done when

- [ ] A member opens Countries from the Master data area and finds India read-only, with its currency and calling code
- [ ] The platform operator sees each set's versions and loads one from the screen (audited); a workspace admin cannot
- [ ] The hub shows the right state for the login that saw "No access", with the reason
- [x] `pnpm verify` green; `next build` for the web; evidence in `.pi/work/WI-OI-176.md`; `.pi/NOW.md` updated

## Stop and ask if

- the "No access" cause is a permission design question (which role should read which master).
