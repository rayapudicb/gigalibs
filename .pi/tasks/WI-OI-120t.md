# WI-OI-120t (M-CM1): CMMS on metadata windows, first value

- **Status:** In progress (Slice 1 & Slice 2 verified in Review, 2026-10-11). Last M1a card of `docs/plans/platform-implementation-plan.md`; needs S16
  (WI-OI-120s) and, per slice, R5 (CMMS access paths) and T3 (one place identity). Each slice is shown before it starts.
- **Work item:** WI-OI-120. Evidence goes in `.pi/work/WI-OI-120.md`.
- **Size:** L (four slices, each shown and approved before it starts)

## Why

- CMMS screens are one hand-written component (`CmmsWorkspace`, `@gigalibs/cmms-web`) with eight sections. Nine
  more pages are "not connected" placeholders in `module.yaml`.
- A workspace cannot add a field, hide one, make one required or rename a label. Each change is a code release.
- A maintenance technician can change **any** work order (`cmms.work-orders.write`). The owner accepted this gap for
  UAT only (2026-10-06); it must close before production.
- Maintenance requests have a table (`maintenance_requests`) but no service and no screen, so "request, work order,
  assign, execute, close" cannot be done on screen.

## Goal

A CMMS-only customer runs maintenance on metadata windows:
- staff raise requests;
- planners turn requests into work orders and assign them;
- technicians execute **their own** work orders;
- planners close them.
Each workspace can adjust these screens without a release.

## Design

1. **Slice 1, work orders.** Windows over record adapters that call `work-orders.service.ts` (no table access):
   - list, read, create and edit;
   - status actions follow `CMMS_WORK_ORDER_TRANSITIONS` (start, hold, resume, complete, cancel), each with its reason
     form where the service needs one;
   - child tabs: tasks, labour, parts, notes and history.
   **Do my own work:** a new permission `cmms.work-orders.execute-own` lets its holder run status, task, labour, part
   and note actions only on work orders whose `assigned_to` is their own login. The adapter refuses any other work
   order (403, not hidden). The Maintenance technician role moves from `cmms.work-orders.write` to it.
   `cmms.work-orders.write` stays with planners.
2. **Slice 2, requests.** A request service over `maintenance_requests`:
   - submit (`cmms.requests.create`, for any member with the module);
   - triage by a planner: accept into a work order, or reject with a reason;
   - the requester sees the status of their own requests.
   It replaces the two "not connected" request pages.
3. **Slice 3, plans and stock.** Preventive schedules (with "generate work orders"), meters (readings as a child tab)
   and MRO parts (movements as a child tab). Parts issue and return keep going through CMMS until T5 (one stock
   authority) moves them to Inventory.
4. **Slice 4, assets and facilities, after T3.** Assets (with specifications by classification) and classifications.
   Facility details are keyed by the Geospatial place id. The place tree and the map come from Geospatial (ADR-0006).
5. **Stay components inside governed screens** (named exceptions): the floor kiosk, CAD layers and the map. Their
   fields, permissions and actions still come from metadata.
6. **Out of this card:** the overview and reliability dashboards (reports, S7). The people, workload and calendar
   pages move to Workforce (M-WF1). Purchase orders and vendors move to Procurement (Phase 4). Each placeholder is
   removed when its replacement exists.
7. **Every slice is followed by:**
   - the conversion check (S16);
   - the module roles updated (WI-OI-120n);
   - its section of the tenant-to-value journey (WI-OI-120m) rerun.

## Scope

- **May change:** `modules/physical-operations-cmms` (adapters, the request service and its forward migration if one
  is needed, windows, `module.yaml` pages, routes and roles, web components named above), generated catalogues,
  journey specs.
- **Must not change:** the CMMS import/export files, applied migrations, other modules' data, running services.

## Proof

- Adapter tests per entity, including the technician refused on someone else's work order and allowed on their own.
- `scripts/verify-module-conversion.mjs physical-operations-cmms` passes.
- Journey: requester raises a request → planner accepts and assigns → technician starts, logs labour and parts,
  completes → planner closes; the auditor reads but cannot change.
- `pnpm build`, `pnpm test`, `pnpm verify`; Security review before deploy (permission change).

## Done when
 
- [ ] Work orders, requests, schedules, meters and parts are metadata windows (slices 1–3); assets after T3.
- [x] Technicians can change only their own work orders; the UAT gap is closed (Slice 1 verified in source).
- [x] Requests service over canonical maintenance_requests with submit, triage, cancel and metadata window (Slice 2 verified in source).
- [ ] The journey passes the request-to-close path.
- [ ] Checks pass; evidence recorded; images built and handed to the owner per slice.

## Stop and ask if

- an existing UAT work order has no `assigned_to` but is being worked (a data question for the owner);
- a slice needs a CMMS import/export change.
