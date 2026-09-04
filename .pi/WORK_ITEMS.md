# GigaLibs work-item and handoff registry

Owner: SDLC Orchestrator  
Status values: `Proposed`, `Ready`, `In Progress`, `Review`, `Blocked`, `Accepted`, `Released`  
Rule: only named human authorities can move a release through product/risk/release acceptance.

| Work item | Requirements | Status | Current owner | Required independent reviewers | Gate | Evidence / next handoff |
| --- | --- | --- | --- | --- | --- | --- |
| WI-OI-001 | FR-01–FR-16, NFR-GOV-001 | Review | SDLC Orchestrator | Product, Architecture, QA | G0 | Gap map, ADR, quarantine and audit exist; human approval pending |
| WI-OI-002 | FR-02–FR-05, FR-08–FR-12, FR-15 | Review | Backend & Data Engineer | QA, Security, Product | G4–G5 | AP/integration/workflow/BFF/retention certifications pass; full G5 controls pending |
| WI-OI-003 | NFR-REL-001–003, NFR-SEC-001–005, NFR-OPS-001–004 | Review | QA/SDET | Security, SRE, Product | G5 | Assembled independent Release 1 verification and resolved WI-OI-005–010 evidence packages in .pi/work/WI-OI-003.md |
| WI-OI-004 | NFR-GOV-001–003 | Review | SDLC Orchestrator | Product Requirements, QA | G1 | Nineteen-agent roster, baseline, tracker, WIP and `audit:sdlc` pass; independent review pending |
| WI-OI-005 | FR-14, FR-15, NFR-SEC-001–006, NFR-DATA-001–004 | Review | Security & Privacy | Solution Architect, QA | G2 | Threat model, permission matrix, data-flow and residual-risk register in docs/architecture/THREAT_MODEL_AND_PERMISSIONS.md |
| WI-OI-006 | NFR-DATA-003, NFR-REL-003, NFR-OPS-003 | Review | DevSecOps/SRE | Backend/Data, QA | G2–G5 | Clean migration replay, backup/restore, roll-forward and DR evidence in docs/runbooks/database-disaster-recovery.md |
| WI-OI-007 | FR-11, NFR-OBS-001–004, NFR-PERF-001 | Review | Infrastructure Observability | Backend, QA, Security | G2–G5 | Authenticated aggregate metrics, correlation boundaries, and Prometheus alerts pass; traces and SLO evidence in .pi/work/WI-OI-007.md |
| WI-OI-008 | NFR-SEC-004, NFR-SC-001–004 | Review | DevSecOps/SRE | Security, License/Supply-chain, QA | G5 | CI secret/SAST/dependency/container/IaC/SBOM/provenance gates pass; evidence in .pi/work/WI-OI-008.md |
| WI-OI-009 | FR-11, NFR-UX-001–004 | Review | Web, UX & Accessibility | QA, Product | G3–G5 | Role/state coverage, WCAG 2.2 AA and first-time usability evidence pass; in .pi/work/WI-OI-009.md |
| WI-OI-010 | FR-03, FR-08, NFR-PERF-001–003, NFR-REL-001–003 | Review | QA/SDET | SRE, Architecture | G5 | Representative load, noisy-neighbor, fault, retry and recovery tests pass; in .pi/work/WI-OI-010.md |
| WI-OI-011 | FR-13 | Review | Product Requirements | Security, UX, QA | G1–G5 | Expiring isolated workspace, safe scenario controls, reset/deletion and summary in docs/runbooks/demo-lab-sandbox.md |
| WI-OI-012 | FR-07 | Review | AI & Data Governance | Security, QA, Product | G1–G5 | Authorized document pipeline, retrieval/citations, abstention, evaluation and cost in docs/runbooks/governed-rag-pipeline.md |
| WI-OI-013 | FR-14 | Review | Backend & Data Engineer | Security, UX, QA | G1–G5 | Self-service users/roles, SSO/MFA, promotion/rollback, branding, region, exports in docs/runbooks/tenant-sso-and-residency.md |
| WI-OI-014 | FR-09 | Review | Integration Engineer | Security, Finance/Domain, QA | G2–G5 | External action adapters with separate writes, approval, receipt and reconciliation in docs/runbooks/external-action-reconciliation.md |
| WI-OI-015 | FR-16 | Review | Backend & Data Engineer | Finance/Product, Security, QA | G1–G5 | Usage meters, limits, forecast, alert, cap and invoice reconciliation in docs/runbooks/usage-metering-and-billing.md |
| WI-OI-016 | FR-01 | Review | Product Requirements | Architecture, Security, QA | G1–G5 | Persisted outcome catalogue, immutable pack versions and tenant deployment bindings in docs/runbooks/outcome-pack-versioning.md |
| WI-OI-017 | FR-06, FR-08 | Review | Backend & Data Engineer | Architecture, QA | G2–G5 | Temporal/unit rules, wait, parallel scheduling, resume and compensation in docs/runbooks/durable-workflow-compensation.md |
| WI-OI-018 | FR-01–FR-12 | Review | Product Owner Advisor | Domain, Security, QA | G1–G5 | Two additional packs with real authorized pilot sources and reusable core evidence in .pi/work/WI-OI-018.md |
| WI-OI-019 | FR-17, FR-14–FR-16, NFR-GOV-001–003, NFR-SEC-001–005, NFR-DATA-001–004, NFR-REL-001–003, NFR-OPS-001–004 | Proposed | SDLC Orchestrator | Finance/Domain, Architecture, Security, QA, Product | G0–G3 | AR product boundary, contracts, data model, test plan, and deployment design in modules/accounts-receivable; G4 waits for Release 1 closure and human readiness approval |

## Progress baseline

The full blueprint is estimated at 100 relative delivery points, including implementation and required
production evidence:

| Release | Weight | Earned | Remaining | Interpretation |
| --- | ---: | ---: | ---: | --- |
| Release 0 | 10 | 9 | 1 | Engineering discovery complete; human gate remains |
| Release 1 | 30 | 23 | 7 | Core slice plus control/execution metrics and correlation; production verification/operations remain |
| Release 2 | 20 | 2 | 18 | Reusable foundations only |
| Release 3 | 25 | 6 | 19 | Tenant/security foundations only |
| Release 4 | 15 | 1 | 14 | Strategy/architecture only |
| **Total** | **100** | **41** | **59** | **Approximately 41% complete / 59% pending by delivery effort** |

This is an engineering planning estimate, not measured labour. Re-estimate after G2 decisions, provider
selection, representative load targets and named pilot commitments.
