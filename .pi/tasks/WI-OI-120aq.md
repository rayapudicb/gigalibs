# WI-OI-120aq: Status truth (plan v3 step 0.6)

- **Status:** Built (2026-10-15): S1–S4 done locally; owner approved D1a, D2, D3 and D4 ("approved 120aq as recommended").
- **Plan v3:** step 0.6. "Re-label every Review item by evidence (Built, On UAT, Done). Correct WI-OI-121a–j, which
  claim G6/G7 for a preview. Close each item that §5 replaces, with a pointer to its replacement. Shorten `NOW.md`
  back to one page." (WI-OI-119 follow-up.)
- **Work item:** WI-OI-120. Evidence goes in `.pi/work/WI-OI-120.md`.
- **Size:** M. No product code and no deploy: the registry, card status lines, the governance config and its check,
  and `NOW.md`.

## Why (read-only, 2026-10-15)

- **The registry does not say what is true.** `.pi/WORK_ITEMS.md` has 117 items:
  - 88 Review, 22 Blocked, 3 In Progress, 4 Proposed;
  - "Review" covers items built and never deployed, items on UAT, and items plan v3 §5 replaces;
  - nothing says Done.
- **The allowed statuses cannot say it either.** `config/sdlc-governance.json` allows only Proposed, Ready, In
  Progress, Review, Blocked, Accepted and Released. Plan v3's Built, On UAT and Done are not among them, and there is
  no status for an item closed as replaced. That is why WI-OI-011's "Retired" broke the governance check
  (WI-OI-120ak S5c).
- **WI-OI-121 and 121a–j** carry "withdrawn" banners (WI-OI-120aj), but their registry row says Review, and their
  status lines still say "Approved; in progress".
- **`NOW.md` is 360 lines**, and its "current step" is still 0.4.

## Decisions (for the owner)

- **D1, the status vocabulary.**
  - **a (recommended):** the allowed statuses become:
    - Proposed;
    - Ready;
    - In Progress;
    - **Built** (on the branch, not on UAT);
    - **Review** (built, waiting for its independent review);
    - **On UAT** (in the running release, with the deploy and the journey recorded);
    - **Done** (on UAT, and the owner said it is accepted);
    - Blocked (with the named blocker);
    - **Replaced** (closed; the row names what replaces it in plan v3 §5).

    Accepted and Released go: no item uses them, and UAT is production (plan v3, decision 0.7a). The governance check
    keeps "Done needs the owner's word" (today's rule for Accepted and Released) and adds "Replaced needs a pointer".
  - **b:** keep today's list and map onto it: Released means On UAT, Accepted means Done, and a replaced item stays
    Review with a note. Cheaper, but "Review" keeps meaning several things.
- **D2, evidence for On UAT.** The item's code is in the running release (`f41702b`/`d17db37`, by git ancestry from
  the release branch), and the evidence log records its deploy. Done only where the owner said "accepted"; otherwise
  On UAT.
- **D3, `NOW.md`.** The current text moves unchanged to `.pi/archive/NOW-2026-10-15.md`. `NOW.md` becomes one page:
  - the current plan step;
  - the running release and the last journey;
  - open owner actions;
  - the next three steps.
- **D4, Blocked items (22).** Each blocker is re-read: replaced by §5 → Replaced; still waiting on something outside
  (IdP, DNS, named reviewers) → Blocked, with the blocker named.

## Slices, in order

1. **S1, the vocabulary** (D1): `config/sdlc-governance.json`, `scripts/verify-sdlc-governance.mjs` and its rule
   for Done and Replaced, with a test.
2. **S2, Replaced:** every item §5 replaces is closed with its pointer. 121 and 121a–j become Replaced (GU1–GU7),
   and their card status lines say so.
3. **S3, re-label by evidence** (D2, D4): each Review, Blocked and In Progress item, area by area, with a one-line
   evidence pointer (release ID, journey, or why not).
4. **S4, `NOW.md`** (D3).

All slices are committed only on "commit" and need no release, since nothing is deployed. The governance check runs in
CI and in `pnpm verify`.

## Scope

- **May change:** `.pi/WORK_ITEMS.md`; the status lines of cards in `.pi/tasks/`; `config/sdlc-governance.json`;
  `scripts/verify-sdlc-governance.mjs` and its test; `.pi/NOW.md`; a new `.pi/archive/`.
- **Must not change:** product code; plan v3 (owner-approved); other sessions' files (`.pi/handoff/*`, the untracked
  `WI-OI-120y` card); a card's history beyond its status line and a pointer.

## Done when

- [x] Every registry row has a status the evidence supports, with a pointer; none says Review without waiting for a
  review.
- [x] Each item §5 replaces is Replaced with its pointer; WI-OI-121 and 121a–j included.
- [x] The governance check passes, with the new rules tested.
- [x] `NOW.md` is one page and current; the old text is archived unchanged.

## S1, the vocabulary (2026-10-15): built and verified locally

- `config/sdlc-governance.json` `statusValues`: Proposed, Ready, In Progress, Built, Review, On UAT, Done, Blocked,
  Replaced, with a note on each. Accepted and Released are retired; no item used them.
- `scripts/lib/work-status.mjs` holds the rules; `scripts/verify-sdlc-governance.mjs` uses it in place of its status
  and human-authority checks:
  - On UAT names a release (`release <commit>`);
  - Done records the owner's acceptance;
  - Replaced says what replaces it (`Replaced by …`).
- Test `packages/configuration-core/src/work-status.test.ts` (4 tests): the new statuses pass, the retired and unknown
  ones fail, and each claim fails without its evidence.
- The governance check passes on today's registry.

## S2, Replaced (2026-10-15)

- 94 rows are Replaced, each naming its replacement:
  - 92 from plan v3 §5's table;
  - 084, mobile and offline, which plan v3 places under X7;
  - 044, its stack decision, which plan v3's "UAT is production" replaces.

  The existing evidence text is kept after the pointer.
- WI-OI-045 points to WI-OI-046 to WI-OI-052, the TP slices it designed.
- All 22 Blocked items were among them, so their blockers move to the new cards (D4).
- WI-OI-121 and 121a–j: each card's status line starts "Replaced by GU1–GU7" and keeps its old wording after "Was:".

## S3, re-labelled by evidence (2026-10-15, D2)

The 24 remaining rows were checked by git ancestry (each item's tagged commits are in the running release
`d17db37`) and, where needed, read-only on UAT.

| Status | Items |
| --- | --- |
| **On UAT (14)** | 039, 042, 046, 049, 058, 059, 081, 082, 083, 085, 102, 109, 110, 112. |
| **Built (8)** | 002, 047, 048, 050, 051, 052, 080, 101 (reasons below). |

Notes on the On UAT items:
- 049: the inbox is in use (1,636 events);
- 058: the gutter is in `globals.css`;
- 109: carries its open organization-draft 400 (step 0.8);
- 112: opens only through the UAT preview.

Why the Built items are not On UAT:
- 002: no tagged commits;
- 047 and 080: repository tooling;
- 048: no exports ever made on UAT;
- 050: admission control has no caller;
- 051: the audit chain is empty;
- 052: certifies the Built TP slices;
- 101: two open defects, for step 0.8.

None is Done: the owner has not recorded an acceptance. The registry legend states the new statuses.

## S4, `NOW.md` (2026-10-15, D3)

- The 360-line page is archived unchanged at `.pi/archive/NOW-2026-10-15.md`.
- `NOW.md` is now one page (67 lines): the current step, what runs on UAT, what is built, what waits for the owner,
  known and accepted items (the `WORKFORCE_API_URL` profile drift `scripts/verify.mjs` points to), the next three
  steps and the standing rules.

## Verification

- `scripts/verify-sdlc-governance.mjs` passes, with the new rules on every row.
- The rules' test passes (4/4).
- Registry: 94 Replaced, 14 On UAT, 8 Built, 1 In Progress.

