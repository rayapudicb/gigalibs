# WI-OI-141 evidence: M-INC frontline hazard, near-miss and incident reporting

Card: `.pi/tasks/WI-OI-141.md`. Branch `feat/frontline-suite`; mobile in `/Users/rayapudi/dev/gigalibs_mobile`.

## 2026-11-02 — new Safety Operations module, web, mobile BFF and mobile app

**Ownership (agent decision under the owner's directive; for Architecture, Security & Privacy and EHS review).**
ADR-0035 named Safety Operations a candidate owner after checking SPEED, Workforce compliance and CMMS. SPEED is
pharmaceutical desk screening; Workforce compliance holds people's qualifications; CMMS owns remediation. ADR-0036
(`docs/architecture/ADR-0036-safety-operations-module.md`, proposed) records the new context. The module was created
with `pnpm module:new safety-operations` (hosted in the module host, schema `gigalibs_safety_operations`, gateway
`/api/safety-operations`, audience `gigalibs-safety-operations-api`) and stays `readiness: PLANNED`. The generated
`records` resource is kept as the live-conformance probe.

**Contracts** (`packages/contracts/src/frontline/safety.ts`): severities (GOOD_CATCH, UNSAFE_CONDITION, STOP_WORK),
categories, routes, triage hours (48 h, 8 h, immediate), report, triage, close, stop-work lift, investigation (1–5
whys, root cause, up to 10 factors), `hazardRisk` (likelihood × consequence banding), report, alert, insights. Mobile
problem `MOBILE_SAFETY_CONFLICT`. 3 contract tests.

**Migration 2** (`000002_hazard_reports`): `hazard_counters` (HZ- numbers), `hazard_reports` (operation per reporter;
observed no later than 5 minutes after receipt; triage whole and by someone other than the reporter; closing whole),
`hazard_photos` (append-only), `stop_work_alerts` (one per report; lift whole, by someone other than the raiser),
`stop_work_acknowledgements` (append-only, one per person), `hazard_investigations` (1–5 whys, ≤ 10 factors). Forced
tenant RLS; append-only list in the manifest; pin 1 → 2 (the generated overlay follows). Proof
`db/proofs/000002_hazard_reports.sql` on disposable PostgreSQL 16 (migrations 1–2, non-superuser non-owner role with
runtime grants, rolled back) passed; down to 1 and up to 2, passes again.

**Service** (`apps/api/src/hazards/`): report (photo sniffed ≤ 300 KB; 5-minute future and 7-day late limits; replay by
operation and payload hash; STOP_WORK raises the alert), own reports, the team's list and detail (reporters see only
their own), triage (independent), close (needs the alert lifted and, for INVESTIGATION, a completed investigation),
investigation (versioned; frozen once complete), open alerts, acknowledge (once per person), lift (reason, someone
else), insights (by area and category, overdue triage). Tests: 4 on real PostgreSQL plus the generated configuration
and authorization specs (13). Compiled module and the module host load.

**Manifest**: `safety-operations.hazards.report|read|triage`, `.stop-work.acknowledge|lift`,
`.investigations.manage`; roles Frontline worker (safety), Area safety champion, EHS director; Tenant Admin holds
`safety-operations:*`; 10 hazard gateway routes; `/safety-operations` page from the new web package
`@gigalibs/safety-operations-web` (stop-work banner polling every 30 s, alerts with acknowledge and lift, triage queue
with live risk band, reports with photo, triage, 5-Why investigation and close, insights, report form, CSV export
with formula-neutralised cells). Navigation, upstream and Tenant Admin coverage tables updated.

**Mobile BFF**: `SAFETY_TARGET` on the shared forwarder; `MobileSafetyController` (report, mine, open alerts,
acknowledge); session grant `safety` (report, acknowledge; camera); BFF allowlist; bounded parser on
`/api/v1/mobile/safety/reports`; compose, deployment profile and `.env.example` pass `SAFETY_OPERATIONS_API_URL` and
the module key (optional) to the control plane.

**Mobile app**: contracts mirror; adapter (receipt must match the report; acknowledgement must be the caller's);
feature `@gigalibs/mobile-feature-safety` (stop-work banners refreshed every 30 s with acknowledge, report button, my
reports; report card with severity, category, area, description, photo; stop-work warning; unchanged resend);
routes `/safety`, `/safety/report`; feature, binding, profiles, containment. Mobile lint, typecheck, 1,973 tests,
profiles, architecture pass.

**Gates still open**: ADR-0036 review; deploying the module (generated credentials, module-host image, live
conformance); CMMS remediation via a reviewed outbox/inbox command; audible/push stop-work broadcast; statutory logs
(OSHA 300/300A/301, RIDDOR) with redaction and retention; voice notes and photo markup; location beacons; offline
capture; device proof; owner UAT.

**Module gate (2026-11-02).** `pnpm verify`: the test step fails only on the four known pre-existing suites; 14
optional isolated-database proofs not run. Log:
`/var/folders/jp/fkzm1c3s1d52rj_9cvjv6kx00000gn/T/gigalibs-verify/verify-2026-11-02T02-50-05-376Z.log`. The
deployment-profile step caught that the Docker workspace (`infra/compose/docker/pnpm-workspace.yaml`) lacked the new
web package; the generator had not added the hosted API either. Both added; the profile check passes. `next build`
passes (`/safety-operations`); token and layer audits clean. The synthetic worst signed-context configuration is now
16,682 characters (refused at minting with a reason); the platform decision in WI-OI-134 remains open.
