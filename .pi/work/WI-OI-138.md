# WI-OI-138 evidence: M-SOP visual maintenance work instructions

Card: `.pi/tasks/WI-OI-138.md`. Branch `feat/frontline-suite`; mobile in `/Users/rayapudi/dev/gigalibs_mobile`.

## 2026-11-02 — backend, admin web, mobile BFF and mobile app

**Ownership (agent decision under the owner's directive; for Architecture review).** CMMS writes maintenance work
instructions: procedures may link to a CMMS job plan, executions to a work order or asset. General operating SOPs
(non-maintenance) are not built and remain an open boundary decision (ADR-0035).

**Contracts** (`packages/contracts/src/cmms/sop.ts`): steps with key, title, instruction, gate (NONE, CONFIRM, PHOTO,
READING with unit and limits, DECISION with yes/no branches), dual sign-off and next links; definitions validated
(unique keys, known targets, no cycles); one path function `nextSopStep` (NEXT, AWAITING_COSIGN, END) used by the
server and shown by web and mobile; procedure lifecycle, execution, step result, feedback and step-duration shapes.
Step keys start with a letter so they are gateway `{key}` segments. Mobile problem `MOBILE_SOP_CONFLICT`.

**CMMS migration 30** (`000030_visual_work_instructions`): `sop_procedures` (revision per code; one open draft and one
published revision per code; four eyes: the approver is neither the author nor the last editor), `sop_step_images`
(bounded raster per step), `sop_executions` (pinned revision; work order, asset and their scope; unique operation),
`sop_step_results` (unique operation; reading shape; a trigger refuses deletes and any change except one countersign by
another person), `sop_result_photos` (append-only for the runtime role), `sop_feedback`. Forced tenant RLS. Pins
29 → 30; append-only list gains `sop_result_photos` in compose and `verify-cmms-runtime.sh`. Proof
`db/proofs/000030_visual_work_instructions.sql` on disposable PostgreSQL 16 (CMMS manifest migrations through 30,
non-superuser non-owner role with runtime grants, rolled back) passed; down to 29 while empty and up to 30, passes again.

**Service** (`apps/api/src/sop/`): procedures are shared reference data (authoring and approval need workspace-wide
access, like job plans); draft → submit → approve (by someone who wrote none of it; the previous published revision
becomes SUPERSEDED) or return with a reason; withdraw; revise copies steps and images into a new draft; step images
sniffed by magic bytes (PNG/JPEG/WebP, ≤ 300 KB). Executions take their scope from the work order or asset; only the
performer records steps; a step must be the path's next step and fit its gate; readings record `within_limits`; photos
are sniffed rasters ≤ 500 KB; a dual sign-off step blocks the path until another person countersigns; completion needs
END; a withdrawn safety-critical revision refuses further steps; 5-minute future clock skew; replays by operation id.
Field feedback raised by performers and resolved by authors; average seconds per step and out-of-limit counts over
completed executions. Tests: 7 on real PostgreSQL (`sop.pg.test.ts`). Compiled `AppModule` loads.

**Request size.** The CMMS API now accepts JSON up to 1 MB (the web BFF's cap), as Geospatial does; the 100 KB default
would have refused step images, step photos and M-BOM drawings over ~75 KB (a latent M-BOM defect, fixed here). The
control plane keeps its 100 KB default everywhere except `/api/v1/mobile/sop/executions`, which gets a bounded
dependency-free JSON parser (1 MiB; 413/400 as a mobile problem; 3 unit tests).

**Manifest** (CMMS): `cmms.sop.read|execute|author|approve` (technician read+execute; planner all four; viewer read;
metrology lead read+approve; four eyes enforced by person); 14 gateway routes; `/cmms/sop` "Work Instructions".
**Web**: procedures list, waiting-for-countersign list and open feedback with resolve; structured step editor (gates,
limits, decision branches, next links, dual sign-off, reorder); step pictures; submit, approve, return, withdraw,
revise; guided execution (picture, instruction, gate input, countersign, complete, flag a step); time per step.
Screen-to-gateway test (22 calls), navigation and gateway equivalence updated.

**Mobile BFF**: `MobileSopController` (published procedures, procedure, step image, feedback, awaiting countersign,
start, step, countersign, complete) with UUID and step-key checks and a CMMS-signed context; web `/mobile/v1` allowlist
(step-key-bound); session grant of module `sop` (read + execute, camera).

**Mobile app**: contracts mirror; API adapter (answers must belong to the requested procedure or execution; a step
receipt must hold the step; completion must be COMPLETED); capability pack `@gigalibs/mobile-capability-photo`
(in-memory JPEG still, no file or album, bounded before sending); feature `@gigalibs/mobile-feature-sop` (published
procedures, waiting countersigns, procedure preview and start, guided execution with picture, gate inputs, live limit
flag, photo, countersign by a second person, complete, flag a step; an unconfirmed answer is resent unchanged with the
same operation id and time); routes `/sop`, `/sop/[procedureId]`, `/sop/run/[executionId]`; feature, binding,
profiles and containment.

**Tests and gates**: contracts 3; CMMS real-PostgreSQL 7; web screens, navigation, gateway and mobile-BFF suites;
auth-nest mobile SOP 2 and projection; control-plane parser 3. Mobile lint, typecheck, 1,959 tests, 2 profiles,
architecture.

**Gates still open**: video/GIF media and large manuals (object storage); drag-and-drop flowchart studio (this build
has a structured editor); offline persistence of executions; device proof; owner UAT; Architecture review of the
ownership decision.

**Module gate (2026-11-02).** `pnpm verify`: everything passes except the test step's four known pre-existing suites;
14 optional isolated-database proofs not run. Log:
`/var/folders/jp/fkzm1c3s1d52rj_9cvjv6kx00000gn/T/gigalibs-verify/verify-2026-11-02T01-32-36-106Z.log`. The first run
also flagged a stale permission catalogue (regenerated) and the CMMS served-route check reading controller parameters
as `{id}` (it now treats a manifest `{key}` the same). `next build` passes (`/cmms/sop`); token and layer audits clean.
The synthetic worst signed-context configuration is now 16,003 characters (refused at minting with a reason; realistic
members pass); the platform decision in WI-OI-134 remains open.
