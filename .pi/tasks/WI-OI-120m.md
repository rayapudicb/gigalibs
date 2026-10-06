# WI-OI-120m: CMMS-first tenant-to-value assessment and acceptance design

- **Status:** Approved (owner "proceed", 2026-10-06), with the scope widened by the owner: see "Owner direction".
  Starts after U12 closes. Plan written by GPT; owner direction and journey design added by Claude.
- **Work item:** WI-OI-120; reuse U19/U22/U23 and EAM-001–005, no replacement programme.
- **Size:** L (discovery journey and assessment; repairs are separate cards).
- **Routing:** SDLC Orchestrator → Maintenance/Identity/QA; independent Security review for resulting repairs.
- **Requirements:** FR-01, FR-04, FR-05, FR-08, FR-09, FR-11, FR-14, FR-15; applicable SEC/DATA/REL/UX/OBS NFRs.

## Goal

Identify the smallest changes and executable tests needed for an EAM/CMMS-only tenant to configure sites/users
and complete real maintenance work. Establish an action register reusable across all current modules.

## Scope

- **May change:** assessment/action-register documents, proposed repair/test cards, WI-OI-120 evidence/NOW, and the
  discovery journey under `e2e/` (specs, helpers, findings board).
- **May write at runtime (owner direction):** only inside workspaces the journey itself creates on the UAT instance,
  through the screens, with run-suffixed sign-ups (`journey.<role>.<run>@gigalibs.test`). Never in GigaLibs Global
  Enterprise or any other existing tenant.
- **Must not change:** product code, schemas, deployments, existing data, secrets, CMMS import/export baseline,
  other agents' work, protected untracked material or running web on 5180. Defects found become repair cards.

## Owner direction (2026-10-06)

"Playwright should identify all the bugs: from the tenant, org hierarchy, adding workers, everything covering end to
end; how the data flows, how users capture or enter the data, how the approvals work based on the role; identify UX
issues or confusion, layout issues, UI, actions, data flow."

## Journey design (Claude)

Today's path, traced from the code: sign-up creates only a user; "create workspace" creates a 7-day trial tenant
(one per account) with the trial modules enabled, including CMMS (`asset-maintenance`), Workforce (`gigaops`) and
Geospatial; the ERP modules are not trial modules and need a platform administrator. Invitations are accepted on the
workspace chooser.

1. **Customer admin:** sign up; create the workspace; see which modules are on.
2. **Organization:** unit types, units and the hierarchy (versioned trees: validate, submit); departments; places.
3. **People:** roles; invite a site supervisor, a technician, an approver and an auditor. Each signs up and accepts
   in their own browser; scopes are assigned.
4. **Workers:** add them in Workforce and link them to their users; skills, availability, shifts where offered.
5. **CMMS:** sites and spaces; assets; a request; a work order assigned to the technician; execution and
   completion by the technician; review by the supervisor; a preventive schedule; history and reports.
6. **Approvals by role:** every approval the journey meets is attempted by the right role and by a wrong one.
7. **Access:** the auditor reads but cannot change; another workspace sees nothing.

At every step a recorder captures:
- the data flow (each call: method, path, status and time);
- console and page errors;
- server messages shown to people (raw codes, "Unsupported … route", JSON);
- raw ids or enum codes on screen;
- controls hidden under other elements, and horizontal overflow (desktop and phone width);
- unlabelled controls, and an axe accessibility scan;
- empty states without guidance, slow actions, actions with no visible effect;
- whether saved data survives a reload.

Output: a findings board (`e2e/test-results/journey/index.html`) by step and kind (blocker, bug, data flow, UX,
layout, accessibility), with screenshots and calls. Every finding is triaged into the action register and a repair
card. The journey continues past a blocker where it can, and says what it could not reach.

## Read first

NOW; WI-OI-120 row and relevant source WIs; PLAN lifecycle; REQUIREMENTS_BASELINE IDs above; SDLC G0–G5/DoD;
module completeness; orchestrator and QA/identity roles; ADR-0002/0019/0033;
`docs/plans/tenant-to-value-all-modules-implementation-and-e2e-plan.md`; U19a and EAM-001–005.

## Steps

1. Reconcile recorded source/deployment/configuration evidence without upgrading status from chat claims.
2. Trace tenant provisioning, entitlements, required dependencies, organization/place/asset ownership and personas.
3. Inventory CMMS user actions, jobs and integrations; map requirements, commands, persistence and existing tests.
4. Specify exact first-value and full-CMMS Playwright cases, supporting integration checks and safe test environment.
5. Propose bounded repair/harness cards with exact files and regression risks; stop for approval before product edits.

## Done when

- [ ] CMMS minimum dependency and ownership map established; unresolved decisions explicit.
- [ ] Every inventoried CMMS action has a test/gap entry; all-module plan remains linked.
- [ ] First-value personas/data/expected results and isolation preflight specified.
- [ ] Exact repair/test cards proposed without duplicating existing implementations.
- [ ] `pnpm verify --audits` passes or reports known drift; evidence and NOW updated.

## Stop and ask if

A new business/ownership policy, architecture change, runtime write or deployment is needed.

## Report

At most five bullets: assessed outcome, evidence, gaps, next approved slice and decisions.
