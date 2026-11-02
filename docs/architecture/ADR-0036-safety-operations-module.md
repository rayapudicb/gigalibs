# ADR-0036: Safety Operations module for frontline hazard and incident reports

- **Status:** Proposed for independent Architecture, Security & Privacy and EHS review. Built under the owner's
  directive of 2026-11-01 ("continue all the modules without my intervention implement everything"); the module stays
  `readiness: PLANNED` until this review and live conformance pass.
- **Work items:** WI-OI-141 (M-INC); later WI-OI-143 (M-CONTR) if the review confirms contractor site access here.
- **Builds on:** ADR-0013 (module SDK), ADR-0035 (frontline suite boundaries: "Safety Operations may own incidents and
  contractor site access after checking SPEED, Workforce compliance and Business Partner/Procurement ownership").

## Context

M-INC needs an owner for hazard, near-miss and incident reports, their triage, stop-work alerts and investigations.
The checks ADR-0035 asks for:

- **SPEED (`process-safety-screening`)** is pharmaceutical process-safety desk screening (routes, substances, thermal
  data, screening outcomes). It has no frontline event, triage or alert model; adding one would mix a laboratory desk
  workflow with plant-floor reporting and its roles.
- **Workforce compliance** holds people's qualifications and absences, not workplace events.
- **CMMS** owns assets and maintenance remediation; ADR-0035 assigns it remediation, not the safety record.

No existing owner fits, so a new bounded context is needed.

## Decision

1. Create the business module `safety-operations` with `pnpm module:new`: its own schema `gigalibs_safety_operations`,
   least-privilege role, forced row security, audit and outbox, running inside the shared module host (no new
   service). Gateway `/api/safety-operations`, audience `gigalibs-safety-operations-api`.
2. It owns hazard reports (severity, category, area, optional asset reference, bounded photos), their triage (risk
   rating and route), stop-work alerts with append-only acknowledgements and a reasoned lift, and investigations
   (5-Why, root cause, contributing factors). Assets are plain references to CMMS; people are subjects.
3. Remediation in CMMS, jurisdiction-specific statutory logs (OSHA 300/300A/301, RIDDOR), push alarms and location
   beacons are out of this decision and remain gates: each needs its own reviewed contract (an outbox/inbox command
   for CMMS remediation, ADR-0007).
4. Contractor site access (M-CONTR) is the next candidate for this module, subject to the Business Partner and
   Procurement ownership check.

## Consequences

- One more schema and migration runner in the module host; generated credentials per environment.
- Mobile reaches the module through the control plane like Operator Rounds (`SAFETY_OPERATIONS_API_URL`, a module key).
- Privacy: reports may name people in free text; retention and redaction for statutory export are part of the
  review.
