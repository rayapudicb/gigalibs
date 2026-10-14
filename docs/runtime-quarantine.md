# Runtime quarantine policy

Assessment date: 2026-09-03

## Purpose

Quarantine is a deny-by-default production boundary, not a statement that the contained code is safe or complete. A quarantined directory remains source inventory only. It cannot participate in the pnpm workspace, active dependency graph, production build, or deployed application until it passes the promotion gate below.

The machine-readable authority is `config/runtime-quarantine.json`.

> **2026-09-29 update (WI-OI-102f, ADR-0016 F7):** with the owner's approval, the 104 quarantined packages and the
> quarantined `apps/docs` and `apps/storybook` were **removed** from the repository; git history keeps them. The
> retired `apps/playground-web` was removed too. Only the three separately owned TextFly apps remain quarantined. The
> inventory below records what was quarantined at the 2026-09-03 assessment.

## Current inventory

| Category | Roots | Reason |
| --- | ---: | --- |
| Unimplemented stubs | 74 | Placeholder exports or no certified runtime implementation |
| Fabricated adapters | 4 | Success-looking provider behavior without a verified external operation |
| Showcase-only packages | 2 | Demonstration UI/data behavior or a no-op delivery CLI |
| Incomplete applications | 5 | Non-production scaffolds |
| Unpersisted runtime services | 5 | Runtime state is not durably/authoritatively implemented |
| Unsafe financial runtime | 1 | Financial behavior lacks the required transactional/security controls |
| Other uncertified runtime packages | 19 | Data, tenant, provider, persistence, document-evidence, or active-consumer behavior has not met the gate |
| **Total** | **110** | Excluded and unavailable |

`apps/playground-web` is separately marked `RETIRED`: it exposes no executable build/dev/start/preview script and has no browser entry point.

## Enforced controls

The integrity script verifies all of the following:

- every quarantine path appears exactly once in the registry and has an exact workspace exclusion; a path that is
  present has a package identity, and a path absent from the checkout has nothing to contain and is listed as absent
  (WI-OI-120aj, owner decision E3a, 2026-10-14);
- every quarantine path has an exact exclusion in `pnpm-workspace.yaml`;
- active source cannot import a quarantined package name;
- active manifests cannot depend on a quarantined package;
- retired applications cannot expose executable lifecycle scripts or an entry point;
- active runtime source is scanned for fabricated data/provider/document evidence and delivery claims, demo credentials, public dummy feeds, forced simulation, hardcoded company/bank/tenant/local fallbacks, insecure randomness, and shadow-compiled source;
- active manifests are checked for missing and unused local runtime dependencies;
- NestJS local controllers/providers must be registered by the active module boundary.

Both `audit:production-data` and `audit:all-runtime-data` skip the internals of quarantined roots because those roots are non-runtime. The latter expands scanning to every active package. Neither command certifies the contents of quarantine.

## Promotion gate

A root may leave quarantine only when one reviewable change proves all applicable items:

1. It has a real authoritative data source or provider; no canned success, fake IDs, local-only business mutation, or silent fixture fallback remains.
2. Its persistence model, migrations, ownership, idempotency, concurrency, and retention behavior are defined.
3. Tenant context comes from authenticated server authority, with explicit RBAC and cross-tenant denial tests.
4. Runtime inputs and outputs use strict bounded contracts and reject unknown/invalid content.
5. Secrets are non-returning credential references; configuration has no environment-specific default.
6. Source, derived record, decision, action, and audit lineage is inspectable; classification inheritance and redaction are enforced.
7. Provider failures are observable and retryable/terminal as appropriate; they never return a success-looking substitute.
8. Relevant real integration tests, failure tests, tenant tests, migrations, build, typecheck, and unit tests pass.
9. The package is intentionally added to the workspace and an active consumer; its quarantine entry and workspace exclusion are removed in the same change.
10. All mandatory root audits remain green after promotion.

For external actions, promotion additionally requires scoped write credentials, preconditions, idempotency, approval policy, durable provider receipt, reconciliation, and a compensation/escalation path.

## Mandatory commands

```text
pnpm build
pnpm test
pnpm audit:production-data
pnpm audit:all-runtime-data
pnpm audit:package-dependencies
pnpm audit:api-boundary
```

Deleting a quarantine entry without implementing and certifying the root is a release-policy violation.
