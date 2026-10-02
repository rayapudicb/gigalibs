# WI-WFO-002: Universal Staffing Flow, Bulk Invitations & Digital Contracts

- **Status:** In progress (owner approved 2026-10-02)
- **Work item:** WI-WFO-002 (Staffing Flow, Bulk Invitations & Digital Contracts). Evidence goes in `.pi/work/WI-WFO-002.md`.
- **Size:** M

## Goal

Deliver the end-to-end universal staffing flow: template-based bulk Excel invitation upload/download, individual worker invitations and responses (accept/decline), AI-ready skill-match candidate ranking, digital contract generation with worker e-signature, and conflict-guarded position booking assignments.

## Scope

- **May change:**
  - `modules/gigaops/db/runtime-foundation/000022_wfo_staffing.up.sql` (and down migration)
  - `modules/gigaops/apps/api/src/staffing/*` (invitations, bulk upload, contract generation)
  - `packages/contracts/src/workforce/universal.ts` (invitation and contract schemas)
  - `apps/workflow-platform/components/gigaops/*` (BulkInviteModal, PositionStaffingView, MyJobs, ContractSign)
  - `.pi/work/WI-WFO-002.md` and `.pi/NOW.md`
- **Must not change:**
  - Core tenancy or organization hierarchy tables and migrations from `WI-OI-109`;
  - Uncommitted changes in `.pi/work/WI-OI-103.md` and `scripts/verify-manufacturing-no-developer.mjs`;
  - CMMS import/export;
  - Secrets;
  - Live production-reachable mock data or fake provider bypasses.

## Read first

- `AGENTS.md`
- `WI_WFO_DELIVERY_MANIFEST.md` §WI-WFO-002
- `UNIVERSAL_WORKFORCEOPS_COMPLETE_DESIGN.md` §E-04
- `modules/gigaops/apps/api/src/gigaops.module.ts`

## Steps

1. **Governance & Pre-flight:**
   - Record `WI-WFO-002` in `.pi/WORK_ITEMS.md` and update `config/sdlc-governance.json` and `.pi/NOW.md`.
   - Create initial evidence file `.pi/work/WI-WFO-002.md`.
2. **Database Migrations:**
   - Write `000022_wfo_staffing.up.sql` (`wfo_invitations`, `wfo_contracts`) with forced RLS and down script.
3. **Contracts & API Layer:**
   - Add invitation, bulk upload, and contract DTOs in `@gigalibs/contracts`.
   - Implement Excel/CSV invitation template generator (`GET /wfo/engagements/:id/invitations/template`).
   - Implement bulk upload preview and submission endpoints (`/bulk-preview`, `/bulk-submit`).
   - Implement invitation response (`accept` / `decline`) and contract sign/approve lifecycle.
   - Implement booking assignment integration enforcing non-overlapping bookings via existing `gigalibs_workforce.bookings`.
4. **UI Workbench Integration:**
   - Implement `BulkInviteModal.tsx` (download template, file drag-and-drop, validation grid, confirm send).
   - Implement `PositionStaffingView.tsx` (invited, applied, assigned pools).
   - Implement `MyJobs.tsx` and `SignContractModal.tsx` (worker self-service response & e-sign).
5. **Verification & Audit:**
   - Add unit tests for invitation state machine, bulk CSV/Excel parser, and contract lifecycle.
   - Run `pnpm verify` (must pass with known drift only).
   - Update evidence in `.pi/work/WI-WFO-002.md` and `.pi/NOW.md`.

## Done when

- [x] Migration `000022_wfo_staffing.up.sql` and `.down.sql` written with RLS and constraints.
- [x] Excel/CSV template download and bulk upload preview/submit endpoints tested and operational.
- [x] Worker invitation accept/decline state machine functional.
- [x] Digital contract generation and e-signature workflow tested.
- [x] Double-booking exclusion constraint verified upon position assignment.
- [x] `pnpm verify` passes cleanly across all packages and audits (only the known `WORKFORCE_API_URL` drift).
- [x] Evidence recorded in `.pi/work/WI-WFO-002.md`.
- [ ] Automated Playwright browser certification executed on live container deployment.

## Stop and ask if

- A decision is needed that the vision or owner has not settled;
- A step would change a running production service or live owner data without authorization.

## Report

At most five bullets: what changed, the evidence, what's next, and what the owner must decide.
