# WI-OI-046 refreshed focused pre-Build baseline

Date: 2026-09-24  
Status: PASS for current pre-change scope; TP-1 remains unimplemented and unauthorized

## Result

The focused Configuration contracts, compiler, API and web baseline remains green after WI-OI-042
remediation and review reconciliation.

| Check | Result |
| --- | --- |
| Contracts build | PASS |
| Configuration core build | PASS |
| Contract/compiler tests | PASS — 4 files, 30 tests |
| Playground API tests | PASS — 10 files, 47 tests |
| Workflow platform typecheck | PASS |
| Focused workflow tests | PASS — 3 files, 10 tests |
| Configuration contract audit | PASS — 11 outcomes, 32 operations |
| Local deployment-profile audit | PASS — 51 required API environment keys |
| Static observability audit | PASS — 13 metrics, 6 alerts, 16 panels, 8 outcomes |
| SDLC audit | PASS — 47 work items, no active G4 item |

Total focused tests: 87 passing across 17 files. The machine-readable result is
`infra/compose/evidence/wi-oi-046-prebuild-20260924/focused-baseline.json`.

## Identity

- Git revision: `5abfa667bb105143ba8c00bc07b1fb4e6d9ac7d6`
- Candidate manifest:
  `docs/reviews/WI-OI-046-g3-prebuild-candidate-manifest-2026-09-24.sha256`

The whole-context source-state identity is intentionally captured only at authorized Build entry, after
governance reconciliation and before product changes. This pre-Build refresh is bound to the exact
candidate manifest instead.

## Boundary

This proves only that TP-1 has a stable, green focused starting point. It does not prove the unimplemented
adapter, registry, entitlement mapping, server-owned runtime scope, new strict response/error contracts or
visible web state machine. It does not resolve repository-wide Analytics/CMMS/quarantine failures and does
not supply Security, IAM/Tenancy, Infrastructure/SRE, API Contracts, Web/Accessibility or QA/SDET human
acceptance.
