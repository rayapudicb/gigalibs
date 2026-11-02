# WI-OI-138: M-SOP Visual work instructions (CMMS extension, web and mobile)

- **Status:** Approved (owner, 2026-11-01: "continue all the modules without my intervention implement everything");
  In progress on `feat/frontline-suite`.
- **Work item:** WI-OI-138. Evidence: `.pi/work/WI-OI-138.md`. Spec: `docs/products/mobile-suite/10-visual-sops-work-instructions.md`;
  ADR-0035 (CMMS owns maintenance job plans/manuals; general operating SOPs are a separate boundary decision).
- **Size:** L

## Ownership decision (agent, under the owner's directive; for review)

CMMS writes maintenance work instructions — procedures optionally linked to a CMMS job plan, executions optionally
linked to a work order. General operating SOPs (non-maintenance) are not built here and stay an open boundary decision.

## Design

- **Data (CMMS migration 30, additive):** `sop_procedures` (revision per code; DRAFT → IN_REVIEW → PUBLISHED by an
  approver who wrote none of it, previous published → SUPERSEDED, or WITHDRAWN; steps as a validated definition;
  safety-critical flag); `sop_step_images` (bounded raster per step, magic-byte checked); `sop_executions` (pinned
  revision, optional work order and asset, client operation id); `sop_step_results` (append-only content; the server
  enforces the next step along the branch path; a countersign by a different user is the only later change);
  `sop_result_photos` (bounded raster evidence); `sop_feedback` (field flags, resolved by engineering).
- **Steps:** key, title, instruction, gate (NONE, CONFIRM, PHOTO, READING with unit and limits, DECISION with yes/no
  branches), optional dual sign-off, optional next. Definitions are validated: unique keys, existing targets, no cycles.
  One shared path function (`nextSopStep`) is used by server, web and mobile.
- **Rules:** a step result must be the next step on the path; a reading outside its limits is recorded and flagged;
  a dual-sign-off step blocks the next step until another user countersigns; completion needs the path's end with
  every countersign; a withdrawn safety-critical revision refuses further steps.
- **Permissions:** `cmms.sop.read|execute|author|approve`. Technician read+execute; planner read+author; metrology
  lead and planner approve (four eyes enforced by person).
- **Mobile:** `/mobile/v1/sop/...` (published procedures, start, step, countersign, complete, feedback); feature `sop`.

## Gates

Video/GIF media and large manuals (object storage); drag-and-drop flowchart studio (this build uses a structured step
editor); offline persistence of executions; device proof; owner UAT; review of the ownership decision.
