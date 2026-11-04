# Developer guide: repositories, branches, and local folders

Last updated: 2026-11-04 (owner standardisation).

## Two GitHub repositories

| Product | GitHub | Default branch for **new work** |
| --- | --- | --- |
| Platform (web, modules, control plane, `/mobile/v1` BFF) | [rayapudicb/gigalibs](https://github.com/rayapudicb/gigalibs) | **`feat/frontline-suite`** |
| Native mobile (Expo operations app) | [rayapudicb/gigaops_mobile](https://github.com/rayapudicb/gigaops_mobile) | **`main`** |

Cloning **only** `gigalibs` and checking out **`master`** does **not** give the current platform codebase.
`master` on GitHub is an older baseline; active delivery lives on **`feat/frontline-suite`** until a reviewed
promotion updates the protected branch (see `AGENTS.md` and `.pi/NOW.md`).

Mobile is **not** inside the `gigalibs` monorepo. Every mobile change belongs in **`gigaops_mobile`**.

## What a new developer should clone

```bash
# Platform — use the integration branch, not master
git clone https://github.com/rayapudicb/gigalibs.git
cd gigalibs
git fetch origin feat/frontline-suite
git checkout feat/frontline-suite
pnpm install --frozen-lockfile

# Mobile — separate repo
git clone https://github.com/rayapudicb/gigaops_mobile.git
cd gigaops_mobile
pnpm install --frozen-lockfile
```

Read **`AGENTS.md`**, then **`.pi/NOW.md`** and the task card before changing product code.

## Why there are many `~/dev/gigalibs-*` folders on one machine

Those directories are usually **git worktrees**: one shared `.git` database, several checkouts on **different
branches** at once. They are a convenience for parallel release and feature work, not separate products.

| Typical path | Typical branch | Use |
| --- | --- | --- |
| `~/dev/gigalibs-rounds` | `feat/frontline-suite` | **Primary implementation** (agents and feature work) |
| `~/dev/gigalibs-release-5180b` | `release/uat-5180-*` | **UAT deploy** build source (owner); matches a named release commit |
| `~/dev/gigalibs` | often an older `release/*` | May be the Cursor workspace root — **verify branch** before editing |

Rule: **do not treat “the folder named gigalibs” as automatically latest.** Run `git branch --show-current`
and compare to `.pi/NOW.md`.

## Branches (platform)

| Branch kind | Naming | Purpose |
| --- | --- | --- |
| Integration | `feat/frontline-suite` | Current module queue (frontline suite, master-data foundation, CMMS mobile BFF, etc.) |
| Feature | `feat/WI-OI-NNN-short-name` | Short-lived; merge into integration via PR |
| Release | `release/uat-*`, `release/convergence-*` | Immutable-ish lines used to build UAT/production candidates |
| Protected baseline | `master`, `dev` | Promotion targets per SDLC; **not** always equal to “what we build today” |

**Deploy** from a **release worktree** at a **named commit** (see evidence in `.pi/work/WI-OI-*.md`).
**Implement** on **`feat/frontline-suite`** (or a feature branch off it).

## UAT vs GitHub

Local UAT (e.g. port **5180**) runs **containers built from a release commit**, not “whatever is open in the IDE”.
After you pull new code, you still need an **owner deploy** (or local compose per runbook) for services to match.

## Pushing your work

```bash
# Platform (from your frontline checkout)
cd ~/dev/gigalibs-rounds   # or any worktree on feat/frontline-suite
git push -u origin feat/frontline-suite

# Mobile
cd ~/dev/gigalibs_mobile
git push -u origin main
```

GitHub **default branch** (UI: Settings → General → Default branch): consider setting **`feat/frontline-suite`**
on `gigalibs` for new clones, or merge integration into `dev`/`master` on a schedule you define in SDLC.

## Related docs

- `AGENTS.md` — mandatory process and verification
- `.pi/NOW.md` — current task and release name on UAT
- `.pi/handoff/ALL-MODULES-COMPLETION-HANDOFF-2026-11-03.md` — multi-repo handover rules
