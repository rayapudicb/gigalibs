# GigaLibs

GigaLibs is being developed as a family of independent operational products. Each product module owns
its UI, API, data model, migrations, deployment artifacts, tests, operations, and release evidence. A
module communicates through versioned APIs and events; it never depends on another module's tables.

## Current truth

- `apps/workflow-platform`, `apps/playground-api`, and `apps/workflow-api` are the active platform path.
- `apps/playground-web` is a retired prototype and is excluded from the production workspace.
- Packages listed in `config/runtime-quarantine.json` are source inventory, not certified products.
- The first new product module is Customer Invoicing and Accounts Receivable in
  `modules/accounts-receivable`. It is currently at design/intake status, not production-ready.
- Production certification is governed by `.pi/PLAN.md`, `.pi/WORK_ITEMS.md`, and the engineering
  completeness standard.

## Repository map

```text
apps/                         Current platform applications
packages/                     Existing active and quarantined shared inventory
platform/                     Target suite control-plane and portal boundaries
modules/accounts-receivable/  First independent product module
shared/                       Small, versioned cross-product protocols only
product/                      Suite plans and exact release composition
tools/                        Module validation and release tooling boundaries
docs/                         Requirements, decisions, runbooks, and evidence
.pi/                          Canonical SDLC plan, roles, and work-item status
```

See `docs/modular-product-lifecycle-blueprint.md` for the target architecture and
`modules/accounts-receivable/README.md` for the first module.

## Local verification

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm audit:production-data
pnpm audit:all-runtime-data
pnpm audit:package-dependencies
pnpm audit:api-boundary
pnpm audit:navigation
pnpm audit:sdlc
```

## Branches

- `master` is the protected, releasable branch.
- `dev` is the integration branch created from `master`.
- Implementation uses short-lived `feat/WI-OI-NNN-description` branches and pull requests into `dev`.
- A reviewed release pull request promotes `dev` to `master`; environments receive immutable artifacts,
  not different source branches.

## Licensing status

No project-wide software license has been selected yet. Public visibility does not grant permission to
copy, modify, or redistribute the code. See `docs/legal/LICENSE_DECISION_REQUIRED.md` before publishing
or accepting contributions.
