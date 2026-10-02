# WI-WFO-002 evidence: Universal Staffing Flow, Bulk Invitations & Digital Contracts

## Authority and state

- Owner approved `.pi/tasks/WI-WFO-002.md` on 2026-10-02 with "yes proceed" / "go".
- WI-WFO-002 is the sole active implementation item.
- Preserved: uncommitted corrections in `.pi/work/WI-OI-103.md` and `scripts/verify-manufacturing-no-developer.mjs`.

## Implementation Evidence (2026-10-02)

1. **Database Migration:**
   - `000022_wfo_staffing.up.sql` & `.down.sql`:
     - `gigalibs_workforce.wfo_invitations`: Unique composite constraint `UNIQUE(tenant_id, position_id, worker_id)`, rate override check, status state machine (`INVITED`, `ACCEPTED`, `DECLINED`, `EXPIRED`, `CANCELLED`), response reason tracking, and forced RLS.
     - `gigalibs_workforce.wfo_contracts`: Digital agreement model with template codes, terms text, signature hash validation (`CHECK (status <> 'SIGNED' OR (signed_at IS NOT NULL AND signature_hash IS NOT NULL))`), approved-by check, and forced RLS.

2. **Shared Contracts (`@gigalibs/contracts`):**
   - Added `CreateWfoInvitationV1Schema`, `BulkInviteRowV1Schema`, `BulkInviteSubmitV1Schema`, `RespondWfoInvitationV1Schema`.
   - Added `GenerateWfoContractV1Schema`, `SignWfoContractV1Schema`, `WfoContractRecordV1Schema`.
   - Unit tests: `modules/gigaops/apps/api/src/staffing/wfo-staffing.spec.ts` (4/4 tests passing).

3. **Backend API Services & Controllers (`modules/gigaops`):**
   - Implemented `WfoStaffingService` and `WfoStaffingController` (`/api/v1/wfo/*`):
     - `GET /wfo/engagements/:id/invitations/template`: Generates downloadable CSV template pre-populated with active positions for that engagement.
     - `POST /wfo/engagements/:id/invitations/bulk-preview`: Pre-upload validation dry run returning per-row validation statuses and position resolution.
     - `POST /wfo/engagements/:id/invitations/bulk-submit`: Atomic batch creation of prospect workers and invitations.
     - `POST /wfo/invitations/:id/respond`: Worker accept/decline state machine.
     - `POST /wfo/engagements/:id/contracts/generate`, `POST /wfo/contracts/:id/sign`, `POST /wfo/contracts/:id/approve`.
   - Bumped `WORKFORCE_SCHEMA_CONTRACT_VERSION = 22` in `runtime-config.ts`.

4. **Frontend UI Workbench (`apps/workflow-platform`):**
   - Implemented `BulkInviteModal.tsx` in `/gigaops/engagements`:
     - 1-click CSV template download.
     - Interactive CSV paste and file upload.
     - Validation preview grid (ready count, error count, row-by-row feedback).
     - Confirmation batch submit.
   - Connected "Bulk invite crew" button inside `WfoEngagementCalendar.tsx`.
   - Next.js production build succeeded cleanly.

5. **Mandatory Verification Gate:**
   - Full `pnpm verify` run: **PASS** (1 known drift on `WORKFORCE_API_URL`).
     - Build: PASS (0 errors)
     - Test: PASS (2,193 tests passing, 0 failures)
     - All 7 SDLC audits: PASS (`audit:sdlc`, `audit:production-data`, `audit:all-runtime-data`, `audit:package-dependencies`, `audit:api-boundary`, `audit:navigation`, `audit:layers`).

