# WI-OI-120ax: Organization steps can be sent without their reason (journey 400 on Submit)

- **Status:** On UAT (release `59d286d`, owner deploy 2026-10-16 05:14Z); journey `ainvqh` confirms the fix. Done needs
  the owner's acceptance.
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

## Built (2026-10-16)

- **The rule, once** (`organization-client.ts`): `reasonProblem` and `REASON_LIMITS` read the limits from the
  contract (`OrgVersionTransitionV1Schema.shape.reason`: 3 to 500 characters after trimming), so the screen and the
  server cannot disagree.
- **`ReasonField`:**
  - it is required and limited to 500 characters;
  - its hint says what is accepted;
  - once something is typed, it says why the reason would be refused, and marks the box invalid
    (`aria-invalid`, `aria-describedby`).
- **The 13 actions wait for a valid reason,** and each button's title says why:
  - Structure: Submit, Withdraw, Approve, Reject, Publish, Activate (Validate needs none);
  - Units: Save an edit, Archive;
  - Unit types: Save an edit;
  - Access: Grant, Revoke;
  - Place links: Link, End.
- **Errors:**
  - a 400 or 422 listing field issues but no organization problems reads "Some details are missing";
  - "The change breaks an organization rule" stays for real rule failures;
  - each field is named in words ("Reason: …", "Expected version: …").
  - Found while testing: the validation pipe sends each path as a dotted string, which the old code dropped, so the
    field name never showed.
- **The journey:** it checks that Submit is disabled before a reason is given (if not, that is a BUG finding), types
  "Journey <run>: first structure for review", submits, and records "submitted for approval" or the alert the person
  saw.
- **Verification:**
  - `organization-client.test.ts`: 12 tests pass, including the reason limits (blank, 2 characters plus spaces, 3,
    500, 501) and the new error wording;
  - the web app's suite: 683 passed, 107 skipped (database-backed), none failed;
  - web type-check: no errors in source (the only errors are stale generated `.next/types` from an old local build);
  - the journey spec loads (`--list`) and type-checks;
  - lint findings on every changed file are the same as at HEAD;
  - audits pass (runtime data, navigation, layers, API boundary, packages, anti-duplication, SDLC); design tokens
    fails only on the 3 files other sessions own, as before;
  - `organization-admin.spec.ts` already gives a reason before every step, so it is unaffected.
- **Next:** release, Security review, the owner's deploy, then the journey on UAT.

## Release 59d286d (2026-10-16): built, Security-approved, checked

- **Release commit `59d286d`** on `release/wi120u-workforce`, applied from `e3fb0ff..4099ea9` (9 files, applied
  cleanly). The 8 app files are byte-identical to `4099ea9`.
- **In the release worktree:**
  - 12 organization tests pass;
  - the web suite: 670 passed, 107 skipped, none failed;
  - no source type errors;
  - the migration pins agree.
- **Images:** the five builds ran 04:49Z–05:10Z. All 9 images carry revision `59d286dc6864` and state
  `2cd9481b56e2`. Release id `local-20261016T044914Z-59d286dc6864-2cd9481b56e2`.
- **Backup** `gigalibs_backup_20261016_051022Z`. The deploy tool is retargeted from `b7632d6`, its 33 tests pass, and
  `--check` passed: 11 images and the backup verified, nothing deployed.
- **Independent Security review: approve.** No High, Medium or Low findings.
  - The buttons are UX only: every write route still refuses a bad reason through its Zod pipe and
    `@RequirePermissions`.
  - Server text renders as React text only, with no HTML sinks in the organization panels.
  - The new "Some details are missing" branch comes after the 401, 403, 404 and 409 checks, so it cannot hide a
    permission refusal.
  - The contracts runtime import exposes nothing; other client components already use it.
  - Parity was confirmed: the same patch-id on both branches, and no server, package, lockfile, migration, compose,
    Dockerfile or env change.
  - Info: a `null` entry in `issues` already threw before this change, and falls back to the "unavailable" view.
    From now on, the journey leaves one submitted version in its own workspace.

## Tests

- `organization-client.test.ts`:
  - `reasonProblem`: blank; 2 characters plus spaces; exactly 3; 500; 501;
  - `describeOrgError`: a 400 with issues only, against a 400 with problems.
- The web type-check, the whole test suite, and the zero-mock, design-token and navigation audits.
- **On UAT, after the owner deploys:** the journey's Structure step records the version submitted, with no BUG
  finding. A read-only query shows the journey's version as SUBMITTED.

## Done when

- [x] No organization action can be sent without its required reason, and the page says why.
- [x] A missing detail is no longer reported as a broken organization rule.
- [x] The journey submits the structure on UAT with no finding against this step.
- [x] Released and Security-reviewed. The owner has deployed it and the journey has been rerun.

## On UAT (2026-10-16)

- **Deploy:** release `59d286d`, owner deploy 05:14Z. The read-only check passed: 11 containers on the new release,
  healthy, 0 restarts, 546 tables, 0 error lines.
- **Journey `ainvqh`:** passed in 3.9 minutes with 54 findings, against 57 for `agxc2i`.
  - The organization 400 is gone. The Structure step reads "… ^validate$ pressed · submitted for approval".
  - No "Submit is offered before a reason" finding, so the guard holds.
  - The two other findings that disappeared are colour-contrast items, which vary between runs. Nothing new appeared.
- **UAT, read-only:**
  - the journey's version 1 is SUBMITTED (lock version 3, submitter recorded);
  - its `STATUS_CHANGE` audit record carries the reason "Journey ainvqh: first structure for review".
- **Seen, not new:** every run since `ac0z09` places only "North plant"; the second "Place a unit" is not offered after
  the first. This is for the journey's next review.
