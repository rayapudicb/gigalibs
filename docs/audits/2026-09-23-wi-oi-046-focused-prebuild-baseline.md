# WI-OI-046 focused pre-Build baseline

Date: 2026-09-23  
Status: Current focused baseline passes; TP-1 remains unimplemented and unauthorized

## Outcome

The existing Configuration contracts, compiler, API and web-focused baseline passes before any TP-1
product change. The machine-readable record is
`infra/compose/evidence/wi-oi-046-prebuild-20260923/focused-baseline.json`.

| Check | Result |
| --- | --- |
| Contracts build | PASS |
| Configuration core build | PASS |
| Contracts/compiler tests | PASS, 4 files and 30 tests |
| Playground API tests | PASS, 10 files and 47 tests |
| Workflow platform typecheck | PASS |
| Focused workflow tests | PASS, 3 files and 10 tests |
| Configuration contract audit | PASS, 11 outcomes and 32 operations |
| Local deployment-profile audit | PASS, 51 required API environment keys |
| Static observability audit | PASS, 13 metrics, 6 alerts, 16 panels and 8 outcomes |
| SDLC audit | PASS, no active implementation work item |

## Harness correction

The proposed package-local `pnpm --filter @gigalibs/contracts test` command returned exit code 1 because it
selected zero files. The tests exist, but the shared Vitest include paths are root-relative. The
verification plan now executes the four contract/compiler files explicitly from the repository root; all
30 tests pass. Zero selected tests is preserved as an invalid attempt and is not counted as success.

The contracts build also warns that the package `types` export condition follows `import` and `require` and
is unreachable to the current resolver. This warning predates TP-1 and is recorded without an unauthorized
package rewrite.

## Boundary

These results prove only the current pre-change baseline. They do not prove D1–D6, because the adapter,
registry and server-resolved runtime scope are not implemented. They do not resolve repository-wide
Analytics/CMMS/quarantine failures or provide Security, IAM/Tenancy, API Contracts, Web/Accessibility or
QA acceptance.
