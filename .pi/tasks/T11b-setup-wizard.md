# T11b — Full set-up wizard (all chosen modules and solution packs)

- **Status:** Built 2026-10-26 (local). Plan item 3.6. Also covers T11a's flow (1.13), since the wizard is
  module-agnostic rather than CMMS-only.

## What existed

The building blocks — module catalogue, solution packs (`SolutionPacksPanel`, installed as a Configuration Studio
change set), the organization/units/sites managers, the people console (S17) and the roles manager (`TenantAccessManager`)
— but no guided wizard tying them together, and **no persisted "setup done" flag** anywhere.

## What T11b adds

A guided set-up wizard at `/setup` that orchestrates the existing screens and shows what is done and what is next.
Because there is no stored setup state, **progress is derived from the workspace's own data** — so the wizard is always
truthful and resumes itself without a state machine to drift.

- **Contracts** (`setup/index.ts`): `SETUP_STEPS` (company → organization → people → access → modules → packs, each
  with a title, description, href to the real screen, and a `required` flag) and the pure `deriveSetupProgress(signals)`
  — per-step status (`done`/`todo`/`optional`), percent over the **required** steps only, the next required step, and
  `allRequiredDone`. Required: company, organization, people, modules; optional: access, packs.
- **Signals** come from the workspace's data: company named + enabled-module count from the signed session; unit,
  member and role counts fetched client-side (`organization/units`, `members`, `roles`). A solution pack's state is
  not cheaply queryable, so `packs` is optional and treated as `optional` until installed.
- **Web** (`app/(app)/setup/page.tsx` + `components/setup/SetupWizard.tsx`): a progress bar, a "next step" call to
  action deep-linking into the right screen, and the ordered step list with status badges and Set-up/Review links. A
  "🚀 Set-up guide" link is added to the Settings cross-nav so admins can find it.

## Proof

- Pure logic: `setup/setup-progress.test.ts` (6 — fresh workspace, fully set up, next-step skipping, unnamed company,
  optional-pack handling, required-step set).
- Render: `setup-wizard.test.tsx` (2 — all steps shown, derived percent, next step, enabled-modules counted).
- Web typecheck green; new files lint clean.

## Deferred (flagged)

- **Entry points beyond the Settings link** — a post-sign-up redirect to `/setup` for a brand-new workspace, and a
  dashboard banner until `allRequiredDone`.
- **A dismiss / "don't show again"** — needs a persisted tenant setting; today the wizard simply shows 100% once the
  required steps are met.
- **In-wizard actions** — the steps deep-link to existing screens; embedding each step's form inline (so a new admin
  never leaves the wizard) is a larger UX piece for review.
- **Pack-installed signal** — querying the active industry/country pack to mark the `packs` step done automatically.
