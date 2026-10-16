# WI-OI-120ax: Organization steps can be sent without their reason (journey 400 on Submit)

- **Status:** Proposed (2026-10-16). Waiting for the owner's approval.
- **Plan v3:** step 0.8 (a core UX follow-up found by journey `ac0z09`).
- **Work item:** WI-OI-120. Evidence goes in `.pi/work/WI-OI-120.md`.
- **Size:** S. Web app and journey only: no API, contract, migration or env change.

## What happened

Journey `ac0z09` (2026-10-16), step "Structure: the primary tree, a draft and placing units", admin: `POST
/api/control/tenants/current/organization/versions/<id>/submit` was refused with 400 "Request validation failed."

## Cause (read-only, 2026-10-16)

- **The server is right.** Every structure step except Validate needs a reason of 3 to 500 characters
  (`OrgVersionTransitionV1Schema`, `packages/contracts/src/organization/index.ts:178`). The request sent an empty one.
- **The page lets a person send it empty.** `OrgStructurePanel.tsx` starts the reason as `''` and posts `{
  expectedVersion, reason }`. Its step buttons are disabled only by `!step.allowed || busy`. Nothing checks the
  reason, so Submit is offered with the box empty. The journey pressed Submit without typing a reason, as a person
  could.
- **The message misleads.** A 400 is shown as "Check the details: The change breaks an organization rule.", with the
  raw rule text below it. A missing reason is not an organization rule.
- **Not the cause:** the version lock. On UAT the journey's version is VALIDATED with lock version 2, which is valid.
- **The same gap is in every organization panel.** 13 actions send a required reason and none of their buttons check
  it:

  | Panel | Actions |
  | --- | --- |
  | Structure | Submit, Withdraw, Approve, Reject, Publish, Activate |
  | Units | Save (an edit), Archive |
  | Unit types | Save (an edit) |
  | Access | Grant, Revoke |
  | Place links | Link, End |

- **What UAT shows:** 16 structure versions in all, 14 VALIDATED and 2 DRAFT. **No version on UAT has ever been
  submitted**, so the approval chain (submit, approve, publish, activate) has never run there.

## Design

**S1. The page (web app):**

1. `organization-client.ts` gains `reasonProblem(value)`. It returns `null` for a reason of 3 to 500 characters after
   trimming, or else a plain sentence: "Give a reason of at least 3 characters." or "Keep the reason to 500
   characters." The limits are the contract's, in one place.
2. `ReasonField` marks the box required, limits it to 500 characters, and shows the hint under it. Once the box has
   been touched, it marks the box invalid (`aria-invalid`, `aria-describedby`).
3. Each of the 13 actions is disabled until `reasonProblem` returns `null`, and its button's title says why. Validate
   needs no reason and stays as it is.
4. `describeOrgError`: a 400 that lists field issues but no organization problems reads "Some details are missing",
   with each issue named in words (for example "Reason: at least 3 characters"). "The change breaks an organization
   rule" stays for real rule failures, the ones that list problems.

**S2. The journey (`e2e/specs/journey-tenant-to-value.spec.ts`):**

1. Before typing, it checks that Submit is disabled with the reason empty. If Submit is enabled, that is a BUG
   finding.
2. It types a reason ("Journey <run>: first structure for review") and then submits.
3. When a step is refused, it records the alert the person saw, not only the response.

**Not in this card:** taking the version through approval in the journey. A second person must approve (the four-eyes
rule in `organization.service.ts:525`), and only Tenant Admins hold `organization:approve`. The journey has one
admin, and its approver persona does not hold it. The choice between a second admin and a steward custom role is
the owner's. It will be carded separately.

## Tests

- `organization-client.test.ts`:
  - `reasonProblem`: blank; 2 characters plus spaces; exactly 3; 500; 501;
  - `describeOrgError`: a 400 with issues only, against a 400 with problems.
- The web type-check, the whole test suite, and the zero-mock, design-token and navigation audits.
- **On UAT, after the owner deploys:** the journey's Structure step records the version submitted, with no BUG
  finding. A read-only query shows the journey's version as SUBMITTED.

## Done when

- [ ] No organization action can be sent without its required reason, and the page says why.
- [ ] A missing detail is no longer reported as a broken organization rule.
- [ ] The journey submits the structure on UAT with no finding against this step.
- [ ] Released and Security-reviewed. The owner has deployed it and the journey has been rerun.
