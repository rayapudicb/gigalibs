# WI-OI-152 evidence — Master data hub and the `spec.masters` registry

## 2026-11-03 — built (queue item 1, claimed by Claude)

- **Registry from manifests.** `spec.masters` in `platform/core.yaml` and eight module manifests (Products, Inventory,
  Business partners, Accounts receivable, General ledger, CMMS, Workforce, Geospatial): 27 masters in six groups.
  `pnpm modules:catalog` validates each one — the route must be a page or menu path the manifest declares; a master
  counted from records must be the entity of one of the module's own windows and takes that window's read
  permission; a control-plane master names a platform lookup and its permission; keys are unique — and generates
  `packages/contracts/src/master-data/registry.generated.ts` (out of date → the manifest audit fails). A wrong route
  or entity was tried and refused with a plain message.
- **Contracts.** `packages/contracts/src/master-data/index.ts`: groups and labels, levels (platform reference, pack,
  module), the entry shape, the lookup cap (50).
- **Web.** `/master-data` and `/master-data/<group>` (`MasterDataScreen` decides on the server which masters the
  person may read: the module is open to them — entitlement and readiness — and they hold the master's read
  permission); `MasterDataHub` shows group tabs and a table (master, group, kept in, records, state, Open). Counts
  come from each module's own API as the person: a one-row page of the record list (`total`) or a platform lookup
  (shown "50+" at the cap), 2 s per master; a refusal is "No access", a stopped or slow module "Unavailable"; the
  answer body is always read (the QA-013 lesson).
- **Sidebar.** A "Master data" group in the daily sidebar for platform operators, tenant admins and operations
  supervisors: "All masters" and one link per group they can read. No catalogue entry or entitlement is added, so
  no workspace data changes.
- **Journey.** M1 "Find and open a master" (target 10 s) added to the dry journey suite; measured after the deploy.
- **Not in this card:** Import and Pack columns (WI-OI-155, WI-OI-154), the Reference data group (WI-OI-153).

## Verification

`pnpm verify` PASS (2026-11-03 11:42Z: build incl. `next build` with `/master-data` and `/master-data/[group]`,
tests, every audit). New tests: contracts registry rules (3), readable masters and counting (5), sidebar for an
administrator, an administrator without masters and a frontline worker (3).

## Open (after the owner's deploy)

On UAT: the hub lists the workspace admin's masters with counts equal to each module's list; journey M1 ≤ 10 s.
