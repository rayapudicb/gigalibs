# <WI-OI-NNN><slice>: <short title>

<!-- Copy this file to `.pi/tasks/WI-OI-NNN<slice>.md`. Keep a card to about one page. Only an Approved card may be
worked; show a new card to the owner and wait for their OK. -->

- **Status:** Proposed | Approved (owner, date) | In progress | Done (commit)
- **Work item:** WI-OI-NNN (its row in `.pi/WORK_ITEMS.md`). Evidence goes in `.pi/work/WI-OI-NNN.md`.
- **Size:** S | M | L

## Goal

One or two sentences: the outcome, in the owner's words.

## Scope

- **May change:** <paths or areas>.
- **Must not change:** <paths or areas>. Never, on any card:
  - the CMMS import/export files;
  - another agent's work;
  - secrets;
  - the web on port 5180.

## Read first

Only what this task needs: <files and sections>.

## Steps

1. <step>

## Done when

- [ ] <observable check>
- [ ] `pnpm verify` passes, or reports only the known drift
- [ ] Evidence is recorded in `.pi/work/WI-OI-NNN.md`, and `.pi/NOW.md` is updated

## Stop and ask if

- a decision is needed that the vision or the owner has not settled;
- a step would change a running service, the database or the owner's data.

## Report

At most five bullets: what changed, the evidence, what's next, and what the owner must decide.
