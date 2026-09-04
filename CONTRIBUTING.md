# Contributing

GigaLibs uses gated work items and pull-request review. Before changing product behavior:

1. Select or create a stable `WI-OI-NNN` item in `.pi/WORK_ITEMS.md`.
2. Link the change to functional and non-functional requirements.
3. Follow `.pi/PLAN.md`, `AGENTS.md`, and `docs/SDLC_DEVELOPMENT_GUIDE.md`.
4. Branch from `dev` using `feat/WI-OI-NNN-short-description`.
5. Include migrations, contracts, tests, security, operations, and evidence for the full vertical slice.
6. Run all mandatory repository verification commands.
7. Obtain independent review for finance, identity, tenancy, secrets, migrations, external actions, and
   release changes.

Do not add production mocks, fake provider success, local-only business persistence, customer data, or
credentials. Contribution acceptance remains paused until the project license and contribution terms are
approved.
