# WI-OI-120ce: SPEED usable on UAT as the prototype shows it — end-to-end check, pack import, starter data

- **Status:** In progress: committed (owner "commit", 2026-10-22): SPEED branch `bd0f63df` + `c4b5c43b`, release
  `d039b970` on `release/speed-uat`; release images building; then backup, deploy check, owner deploy. Implementer:
  Claude Code.
- **Work item:** WI-OI-120bn (SPEED Stage 1, R1). Follows WI-OI-120cd (SPEED on UAT).
- **Owner, 2026-10-21:** "can you check the mock html correctly what is the master data actions, can you test end to
  end to fix the issues and correct flow that needs to be working; can you add the required data as need to start a
  project ..? i need exactly how html looks" (prototype `SPEED-Desk-Screening-Prototype.html`); then "Go" to the plan
  below, which includes loading the BRD §15 criteria and the prototype's starter library, marked unreviewed, into
  "GigaLibs Global Enterprise", and testing on the isolated speed-lab copy (never on UAT).

## Scope (one batch: one review, one commit, one deployment)

1. **End-to-end check in the browser** on the speed-lab copy (project `gigalibs-speed-lab`; its own database, store and
   network; not a site for the owner): the prototype's journey screen by screen, screenshots side by side with the
   prototype's, every defect and visible difference fixed.
2. **Pack import screen:** a SPEED administrator (`speed.settings.manage`) imports a criteria pack and a library pack
   (file, citation, reason), sees what it holds and puts it in force; the existing API (`POST v1/criteria-sets`,
   `v1/library-sets`, `put-in-force`) does the work.
3. **Starter data for the owner's workspace:** the BRD §15 criteria (SPEED-BRD-FRD-001 v0.1; the owner's own
   specification) and the prototype's starter library (26 materials, 12 rules, 5 reaction classes), every entry kept
   unreviewed, so every result and dossier says "library not reviewed" until the safety specialist reviews it. Loaded
   by the owner through the import screen on UAT. The prototype's example route is not loaded; routes are entered by
   people.

Not in scope (R2, next batch): the workflow bar (Submit, Withdraw, Start review, Return, Approve and sign), the
electronic signature, mitigation acceptance, and library propose / approve / apply (plan S10 to S12).

## Prototype vs. product (read 2026-10-21)

| Prototype | Product on 5180 |
| --- | --- |
| Projects, route workbench (step rail; Route & gate, Oxygen balance, Thermal & runaway, Interactions, Green metrics, Write-up parser, Dossier) | Built (R1) |
| Libraries (materials, rules, reaction classes), Audit trail, Outcomes; Settings (OB band) | Built; the band lives in the criteria set |
| Reason for every change; controls; mitigations recorded | Built |
| Workflow bar, e-signature, mitigation acceptance, library change control | R2 (S10 to S12) |
| Role switcher, journey guide, reset, illustrative data | Dropped by design (plan §3.1) |

Master data a project needs: sites (the organization delivered to SPEED), a criteria set in force (else every result
is "data gap: no criteria in force"), a library set in force (else thermal and interaction results are data gaps).

## Progress

- 2026-10-21: the owner pressed "Send to modules again" after `a1765ce6`; the sync job succeeded for SPEED, Workforce,
  Analytics and Product Catalogue; SPEED holds the organization (1 version, 2 units). Prototype screens captured (14).
  speed-lab images building from the SPEED branch `c47a5c1e`.

- 2026-10-21, end-to-end on speed-lab (browser, real sign-in, the lab administrator): every SPEED screen walked and
  compared with the prototype's 14 screens. Found and fixed (SPEED branch, uncommitted):
  1. **Substances:** the library-material lookup answered 400: the module SDK accepted only UUID ids, and SPEED's
     materials are keyed by their stable pack ids (L01 …). The SDK's `LookupResolver` gains an opt-in `idPattern`
     (UUID stays the default for every other module); SPEED's resolver declares its pack-id format. PostgreSQL test
     fails without the fix.
  2. **Audit trail:** the member lookup answered 400 for SPEED's own actor `system:speed-dossier-worker`; system actors
     now stay out of the lookup and are named from the catalogue ("SPEED dossier generator (automatic)").
  3. **Route & gate:** role dropdowns were clipped ("Reactai"), "Add material" wrapped, the equation had no
     subscripts, and the gate card sat below the materials; now full-width roles, one-line button, subscripts
     (coefficients stay full size), the gate card under the equation with a compact In/Out table.
  4. **Thermal ladder:** the same MTSR line was drawn twice at 100 % accumulation; one line, coloured as the prototype.
  5. **Interactions:** Low was blue; the screen spec and the prototype say green.
  6. **Library and Criteria pages:** now open on the set in force with its entries (as the prototype's Libraries), the
     pack import for SPEED administrators (two starter packs shipped with SPEED, or a JSON file, checked against the
     import contract before sending), then every version in the window, where Put in force stays a window action with
     its reason. The metadata window gains an opt-in `onChanged` (called after an action succeeds) so the in-force
     card refreshes. Criteria values are named ("Oxygen-balance alert band, lower limit (%)") with the key beside.
  7. **Stale summary:** after adding steps and materials the tiles still said "Gate 0/0" and the route's Steps field 0:
     SPEED panels now tell each other when a route changes, and panels get an opt-in `refresh` (the window rereads
     the record quietly).
- Checked and correct: sign-in, the expandable SPEED menu, the dossier (generate, DOCX/PDF with SHA-256, preview),
  Outcomes (BO-4 read 0 % only because the lab's old dossier predated the facts; a new dossier gives 100 %).
- Journey on speed-lab passed with no 4xx/5xx and no console error: import both starter packs and put them in force
  from the screens; create a substance linked to a library material by name; create a project; create a route from
  it; add a step and four materials by search; the gate passes.
- Left as found (platform-wide decisions, not SPEED's): the module viewport contract's 5 px gutter (WI-OI-058) instead
  of the prototype's 24 px page padding; "New Routes" (the window labels every child create button "New {tab}"); the
  create form shows read-only computed fields (version, step counts).
- Tests: SDK dispatcher, SPEED unit, PostgreSQL (all SPEED API suites) and panel tests: 207 passed (11
  MinIO-dependent skipped) before the last fixes; SPEED panel tests 60/60 after; web, API and window packages
  typecheck; no new lint finding in any changed file (the files' earlier findings unchanged).
- Lab builds keep 3 image versions (UAT's current and rollback stay); the disk floor is lowered for lab builds only;
  space freed from the build cache and my own superseded lab images.

- 2026-10-22, release: the change applied cleanly onto `release/speed-uat` (`d039b970`); there, 745 tests pass (69
  skipped: database and object-store tests), the web, API and window packages typecheck; the web app's typecheck
  reports only the existing fixture type errors of `speed-workbench-panels.test.tsx` (lines 22, 70 to 73, 124; vitest
  does not typecheck), none in a changed line. A `git stash --keep-index` I ran by mistake in the release worktree
  held only the 12 proof-scripts' executable bits; restored exactly (tree equal to the stash) and the stash dropped.
- Images: `190480718a16` (the rollback of the running release, superseded once this deploy lands) is down to 5 of 9:
  the lab builds kept 3 versions per repository, and two lab versions plus two releases made four. The running
  `a1765ce6c275` (9) is untouched and becomes the rollback of this release. Space: my superseded lab images removed,
  build cache older than 1 h cleared; the release builds with the guard's floor at 30 GB (48 GB free at start).

## Done when

- [x] The prototype journey runs end to end on speed-lab in the browser; differences listed and fixed or recorded.
- [x] Pack import screen with tests (shown to `speed.settings.manage` only; malformed or extra-field pack refused
      before sending; the server checks citations; Put in force with a reason through the window).
- [ ] Review, commit, release onto `release/speed-uat`, owner deploy; the owner imports the starter packs on 5180 and
      creates a project and a route.
