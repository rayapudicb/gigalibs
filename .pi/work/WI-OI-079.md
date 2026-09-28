# WI-OI-079 — Manufacturing Release 1: the first solution built from the core

Status: Proposed (G0 recorded; G1 scope drafted, waiting for the owner decisions below)  
Owner: SDLC Orchestrator / Product Owner / Maintenance Domain / Workforce Domain  
Requirements: FR-01, FR-02, FR-04, FR-05, FR-08, FR-10–FR-12, FR-14, NFR-SEC-001–005, NFR-DATA-001–004,
NFR-REL-001–003, NFR-PERF-001–003, NFR-UX-001–004, NFR-OBS-001–004, NFR-OPS-001–004  
Independent reviewers: Product, Solution Architecture, Security & Privacy, Backend/Data, Web/Accessibility,
QA/SDET, Infrastructure/SRE, Release Authority

## Owner decision (2026-09-28)

1. **Manufacturing is the first industry.** GigaLibs releases one industry first. The roadmap's ten-industry
   suite (P10, WI-OI-073) moves after this release. Industry vocabulary (WI-OI-074) pauses: today's screen
   wording is already maintenance/manufacturing wording.
2. **Business model: one core, assembled per client.** GigaLibs ships a shared, industry-agnostic core plus
   the business modules each client chooses. The architecture target is the kernel / capability module /
   industry pack model of `docs/GIGALIBS_PRODUCT_VISION.md` §2–3.
   - Manufacturing is the first solution built this way.
   - Before a second industry, the module SDK, the web extension points and the selective (per-solution) build
     follow.

### Update 2026-09-28: full package and core first

- The owner approved the full manufacturing package as the roadmap. It has 15 items: Expert Implementation,
  CMMS, EAM, AI-Powered Maintenance, Integrations Marketplace, Asset, Work Order and Parts Inventory Management,
  Industrial Controls and IoT, Checklists and Inspections, Reporting, Facility Maintenance, Resource Planning,
  Preventive Maintenance, Vendor Management.
- Delivery is mobile first for floor roles, with admin configuration.
- The solution and implementation plan is `docs/plans/manufacturing-package-solution-plan.md`:
  - Wave 0: core foundation;
  - Wave 1: Release 1 (this item's scope);
  - Wave 2: parity;
  - Wave 3: IoT and AI.
- New owner decisions D8–D11 are listed there. The work items WI-OI-080 to WI-OI-100 register when the plan is
  approved.

## Business problem (hypothesis; validate with design-partner plants)

A mid-size plant (1–5 sites, 10–100 maintenance technicians, contract crews for shutdowns) runs maintenance
on paper, spreadsheets or a legacy CMMS, and staffs shifts and contract labour somewhere else. Requests, work
orders, labour, crews and hours are not connected. Managers cannot prove preventive-maintenance compliance or
see labour cost per asset.

**Differentiator to prove:** maintenance, crew staffing, site clock-in and approved hours in one system with
audit evidence. Mobile-first CMMS products (for example MaintainX, UpKeep, Limble, Fiix) already own plain
CMMS, so plain CMMS alone is not a reason to buy.

## Solution build `manufacturing`

| Part | Content |
| --- | --- |
| Core | Control plane: identity, tenancy, roles, audit, settings, module entitlements, web shell and gateway (BFF) |
| Modules | CMMS (`physical-operations-cmms`), Workforce (`gigaops`), Geospatial (sites and boundaries) |
| Industry pack | `manufacturing` (Plant Manager, Line Supervisor, Team Leader, Operator, Shift Block) |
| Country pack | Decision D4 |
| Not shipped | Every other module (see "Out of Release 1") |

## Release 1 scope

**In: exists today and needs production gates only.**
- Assets and hierarchy.
- Work orders with tasks, labour, notes, parts, status and history.
- Preventive-maintenance (PM) schedules.
- Meters and readings.
- Spare parts, stock movements and inventory summary.
- Staffing requested from a work order and answered by Workforce (ADR-0007).
- Workforce: resources, capabilities, availability, jobs, scheduling, bookings.
- Site clock-in with geofence, timesheets with four-eyes approval, time exceptions.

**Gaps a plant needs before go-live.** Evidence is from the repository on 2026-09-28.

| # | Gap | Today | Priority |
| --- | --- | --- | --- |
| G-1 | Maintenance requests: an operator reports a fault, a supervisor approves it, and it becomes a work order | `/cmms/requests` is a placeholder; module.yaml lists `maintenance-requests` as contained | Must |
| G-2 | Automatic PM generation: due schedules create work orders without a click | `POST pm-schedules/:id/generate` is manual; `automatic-pm-generation` is contained | Must |
| G-3 | Onboarding import of assets and parts from spreadsheets | Import/export code exists but is not mounted, and is hash-frozen under WI-OI-043 | Must (decision D3) |
| G-4 | Technicians work orders on a phone | CMMS and Workforce screens were never tested at phone width; there is no mobile client | Must |
| G-5 | Basic maintenance KPIs: open and overdue work orders, PM compliance, MTTR, downtime | API overview exists; `/cmms/analytics` is a placeholder; `reliability-analytics` is contained | Should |
| G-6 | The build shows only live screens | CMMS placeholders (requests, purchase orders, vendors, people, workload, floor, calendar) appear in navigation | Should |
| G-7 | Permit-to-work and lock-out/tag-out (LOTO) | Built by the other stream (ePTW, LOTO handover) and unreviewed; its migrations are not applied | Decision D2 |
| G-8 | Pay output | US-CA-OT and IN-48 are reference packs, usable only in the local profile | Decision D4 |

## Out of Release 1 (frozen, not deleted)

These stay out of the build and the Review queue until a client needs them:
- Accounts receivable, spend and AP, tax, multi-currency.
- E-signature, document scanner, Communications and TextFly.
- Recovery, Rule Pro, Data Studio, Ontology, Saga.
- Workflow Studio and Analytics Studio.
- CMMS purchase orders, vendors, IoT ingress, reliability analytics beyond G-5.
- Ten-industry suite (P10), vocabulary (WI-OI-074), custom fields and catalogues.

## Owner decisions needed

| # | Decision | Recommendation |
| --- | --- | --- |
| D1 | Commit the current work; one agent in the repository | Commit in reviewable pieces now; move the other stream's unreviewed forms and ledger work to its own branch |
| D2 | Permit-to-work, LOTO and shift handover (other stream) | Review them for Release 1: they are the strongest manufacturing differentiator |
| D3 | Unfreeze CMMS import (WI-OI-043) | Unfreeze for assets and parts import only |
| D4 | Pay in Release 1 | Export approved hours to the client's payroll. Calculate gross pay only after a statutory pack for the client's jurisdiction is approved |
| D5 | Production hosting | Lift the 2026-09-22 local-only amendment for this release; choose managed cloud or the client's own servers |
| D6 | Design-partner plants and the UAT tenant | Two or three plants; this also unblocks WI-OI-072 (P9) |
| D7 | Freeze list above | **Approved 2026-09-28** ("proceed" on the plan of action): 19 out-of-package items set to Blocked (frozen) |

## Sequence

1. **Decisions D1–D7.**
2. **Boundary (about 2 weeks, no behaviour change).**
   - Layering ADR.
   - Dependency audit: the core never imports a module, and modules never import each other.
   - `manufacturing` solution file.
   - Core package classification.
   - Triage of the Review queue against the freeze list.
3. **Gap builds G-1 to G-6.** Each is its own work item through G0–G7.
4. **P9 (WI-OI-072) on the manufacturing UAT tenant (milestone M2).**
5. **Production path.**
   - Independent reviews.
   - Design-partner UAT.
   - Hosting.
   - Release authority (milestone M4, manufacturing only).
6. **After Release 1.** Module SDK, web extension points and the selective build, then the second industry.
   WI-OI-074 resumes then.

Rough size: about 3 months from the decisions to the first plant in production, for one team. Re-estimate
after D1–D7.

## Release 1 acceptance

At a design-partner plant, on production hosting:
- operators raise requests;
- PMs generate by themselves;
- technicians complete work orders on phones, with parts and labour;
- contract crews are requested from work orders, clock in on site and are approved by supervisors;
- approved hours reach payroll;
- managers see the maintenance KPIs.

Evidence:
- every change is audited;
- 0 Critical and 0 High findings;
- WCAG 2.2 AA with 0 serious or critical findings, including at phone width;
- restore and resilience evidence;
- a named human release authority signs off.
