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
| WI-OI-013 | FR-14 | Blocked | Backend & Data Engineer | Security, UX, QA | G1–G5 | Local IAM, tenant, recovery and PostgreSQL evidence is preserved. Completion is blocked on external IdP/SCIM/SAML/WebAuthn interoperability, operator-controlled DNS/TLS, regional infrastructure, production-scale PITR/failover and named independent reviewers. The owner reprioritized WI-OI-039 on 2026-09-13; WI-OI-013 remains No-Go and must return to Build before production release. |
| WI-OI-014 | FR-09 | Review | Integration Engineer | Security, Finance/Domain, QA | G2–G5 | External action adapters with separate writes, approval, receipt and reconciliation in docs/runbooks/external-action-reconciliation.md |
| WI-OI-015 | FR-16 | Review | Backend & Data Engineer | Finance/Product, Security, QA | G1–G5 | Usage meters, limits, forecast, alert, cap and invoice reconciliation in docs/runbooks/usage-metering-and-billing.md |
| WI-OI-016 | FR-01 | Review | Product Requirements | Architecture, Security, QA | G1–G5 | Persisted outcome catalogue, immutable pack versions and tenant deployment bindings in docs/runbooks/outcome-pack-versioning.md |
| WI-OI-017 | FR-06, FR-08 | Review | Backend & Data Engineer | Architecture, QA | G2–G5 | Temporal/unit rules, wait, parallel scheduling, resume and compensation in docs/runbooks/durable-workflow-compensation.md |
| WI-OI-018 | FR-01–FR-12 | Review | Product Owner Advisor | Domain, Security, QA | G1–G5 | Two additional packs with real authorized pilot sources and reusable core evidence in .pi/work/WI-OI-018.md |
| WI-OI-019 | FR-17, FR-14–FR-16, NFR-GOV-001–003, NFR-SEC-001–005, NFR-DATA-001–004, NFR-REL-001–003, NFR-OPS-001–004 | Review | Backend & Data Engineer | Finance/Domain, Architecture, Security, QA, Product | G4 | AR standalone vertical slice verified live on Port 5180 with PostgreSQL 16 persistence and Port 3400 daemon; in .pi/work/WI-OI-019.md |
| WI-OI-020 | FR-02, FR-04, FR-09, FR-14, FR-15, FR-16, NFR-GOV-001–003, NFR-SEC-001–005, NFR-DATA-001–004 | Review | Backend & Data Engineer | Finance/Domain, Architecture, Security, QA, Product | G4 | Spend Management & AP Studio verified live on Port 5180 with PostgreSQL 16 persistence and Port 3500 daemon; in .pi/work/WI-OI-020.md |
| WI-OI-021 | FR-02, FR-04, FR-06, FR-14, FR-16, NFR-GOV-001–003, NFR-SEC-001–005, NFR-DATA-001–004 | Review | Backend & Data Engineer | Finance/Domain, Architecture, Security, QA, Product | G4 | Enterprise Tax Nexus & Multi-Jurisdiction Engine verified live on Port 5180 with PostgreSQL 16 persistence and Port 3600 daemon; in .pi/work/WI-OI-021.md |
| WI-OI-022 | FR-02, FR-04, FR-06, FR-12, FR-16, NFR-FIN-001–004, NFR-SEC-001–005, NFR-DATA-001–004 | Review | Backend & Data Engineer | Finance/Domain, Architecture, Security, QA, Product | G4 | Enterprise MultiCurrency & Global Treasury Foundation Engine verified live on Port 5180 with PostgreSQL 16 persistence and Port 3700 daemon; in .pi/work/WI-OI-022.md |
| WI-OI-023 | FR-02, FR-04, FR-07, FR-12, FR-14, FR-16, NFR-GOV-001–003, NFR-SEC-001–005, NFR-DATA-001–004 | Review | Backend & Data Engineer | Architecture, Security, QA, Product | G4 | Universal Data Studio & Schema Governance Engine verified live on Port 5180 with PostgreSQL 16 persistence and Port 3800 daemon; in .pi/work/WI-OI-023.md |
| WI-OI-024 | FR-06, FR-08, FR-12, FR-14, FR-16, NFR-SEC-001–005, NFR-DATA-001–004, NFR-REL-001–003, NFR-OPS-001–004 | Review | Backend & Data Engineer | Architecture, Security, QA, Product | G4 | Universal Rule Pro & Policy Decision Engine verified live on Port 5180 with PostgreSQL 16 persistence and Port 3900 daemon; in .pi/work/WI-OI-024.md |
| WI-OI-025 | FR-06, FR-08, FR-09, FR-12, FR-14, FR-16, NFR-REL-001–003, NFR-OPS-001–004, NFR-SEC-001–005 | Review | Backend & Data Engineer | Architecture, Security, QA, Product | G4 | Workflow Studio & Durable DAG Orchestrator verified live on Port 5180 with PostgreSQL 16 persistence and Port 4000 daemon; in .pi/work/WI-OI-025.md |
| WI-OI-026 | FR-02, FR-03, FR-04, FR-08, FR-14, NFR-SEC-001–005, NFR-REL-001–003, NFR-OPS-001–004 | Review | Backend & Data Engineer | Architecture, Security, QA, Product | G4 | Universal Enterprise Connector Hub verified live on Port 5180 with PostgreSQL 16 persistence and Port 4100 daemon; in .pi/work/WI-OI-026.md |
| WI-OI-027 | FR-06, FR-08, FR-10, FR-12, FR-15, NFR-SEC-001–005, NFR-DATA-001–004, NFR-OPS-001–004 | Review | Backend & Data Engineer | Architecture, Security, QA, Product | G4 | Autonomous Cash Leakage & Recovery Studio verified live on Port 5180 with PostgreSQL 16 persistence and Port 4200 daemon; in .pi/work/WI-OI-027.md |
| WI-OI-028 | FR-13, FR-14, FR-15, FR-16, NFR-SEC-001–005, NFR-DATA-001–004, NFR-OPS-001–004 | Review | Backend & Data Engineer | Solution Architecture, Security, QA, Product | G4 | Real Multi-Tenant RBAC, Centralized Platform Control Panel, Self-Service Marketplace & Dynamic DB Isolation on Port 5180 with Port 4300 daemon; in .pi/work/WI-OI-028.md |
| WI-OI-029 | FR-05, FR-08, FR-14, FR-16, NFR-GOV-001–003, NFR-SEC-001–005, NFR-DATA-001–004 | Review | Solution Architecture & Web | QA, Security, Product | G4 | Universal Geospatial Intelligence & OpenStreetMap Studio verified live on Port 5180; in .pi/work/WI-OI-029.md |
| WI-OI-030 | FR-03, FR-06, FR-08, FR-14, FR-16, NFR-REL-001–003, NFR-OPS-001–004, NFR-SEC-001–005 | Review | Backend & Infrastructure Engineer | Solution Architecture, Security, QA, Product | G4 | Multi-Tenant Infrastructure Broker Engine & Zero-Developer Automated Provisioner (RabbitMQ, Redis, Kafka) on Port 5180; in .pi/work/WI-OI-030.md |
| WI-OI-031 | FR-01, FR-02, FR-04, FR-06, FR-09, FR-10, FR-12, FR-14, FR-16, NFR-FIN-001–004, NFR-SEC-001–005, NFR-REL-001–003 | Review | Solution Architect & Full-Stack Engineer | Solution Architecture, Finance/Domain, Security, QA, Product | G4 | Turn-Key Enterprise Solution Packs Hub & Closed-Loop Autonomous Business Engine (P2P Defense, O2C Acceleration, Legacy-to-Cloud Bridge) on Port 5180; in .pi/work/WI-OI-031.md |
| WI-OI-032 | FR-02, FR-03, FR-04, FR-08, FR-14, NFR-SEC-001–005, NFR-REL-001–003, NFR-OPS-001–004 | Review | Integration & Security Engineer | Solution Architecture, Security & Privacy, QA/SDET, Product | G4 | 1-Click OAuth Handshake Studio & Scope Discovery for Commercial ERPs (Salesforce, NetSuite, SAP, Stripe, QuickBooks) on Port 5180; in .pi/work/WI-OI-032.md |
| WI-OI-033 | FR-01, FR-02, FR-04, FR-06, FR-09, FR-10, FR-12, FR-14, FR-16, NFR-FIN-001–004, NFR-SEC-001–005, NFR-REL-001–003 | Review | Solution Architect & Full-Stack Engineer | Solution Architecture, Finance/Domain, Security, QA, Product | G4 | Out-of-the-Box Day-1 Client Experience & Inbound Document Action Workbench on Port 5180; in .pi/work/WI-OI-033.md |
| WI-OI-034 | FR-06, FR-08, FR-12, FR-14, FR-16, NFR-REL-001–003, NFR-SEC-001–005, NFR-OPS-001–004 | Review | Solution Architect & Systems Engineer | Solution Architecture, Security, QA, Product | G4 | Plug-and-Play Universal Rule Engine Kernel & No-Code Visual Rule Studio on Port 5180; in .pi/work/WI-OI-034.md |
| WI-OI-035 | FR-02, FR-04, FR-06, FR-12, FR-14, FR-16, NFR-FIN-001–004, NFR-SEC-001–005, NFR-REL-001–003 | Review | Solution Architect & Financial Systems Engineer | Solution Architecture, Finance/Domain, Security, QA, Product | G4 | Production-Grade Invoicing & AR Subsystem: Multi-Tier Tax Engine, Ledger Cryptographic Hash-Chained Integrity Seals, Installment Billing, and Triple-Broker Concurrency on Port 5180; in .pi/work/WI-OI-035.md |




## 2026-09-09 readiness evidence qualification

The owner reports no manual testing and no established confidence in source-data legitimacy or complete
module business outcomes. WI-OI-036 independently found current-source and local-runtime P0/P1 defects,
including invalid-credential administrator sessions, unauthenticated invoice access and fabricated
financial execution responses. Earlier `verified live` and `pass` wording in the rows above is historical
claim text and must not be treated as current full-module/UAT/production certification. Existing statuses
and estimates are preserved pending evidence reconciliation; no human acceptance is inferred.

| Work item | Requirements | Status | Current owner | Required independent reviewers | Gate | Evidence / next handoff |
| --- | --- | --- | --- | --- | --- | --- |
| WI-OI-036 | FR-01–FR-16, FR-17, NFR-GOV-001–003, NFR-DATA-001–004, NFR-SEC-001–006, NFR-REL-001–003, NFR-UX-001–004, NFR-OBS-001–004, NFR-OPS-001–004 | In Progress | SDLC Orchestrator / QA-SDET | Security, Architecture, Finance/Domain, QA, Product | G0 / G4–G5 audit | Initial source and local HTTP baseline in docs/audits/2026-09-09-readiness/README.md; P0/P1 findings, full manual/UAT and exhaustive verification remain open; no implementation or release authority exercised |

## Audit-derived implementation planning

These entries record a proposed plan and corrected CMMS discovery ownership. They do not approve new
production scope, move another module into Build, or certify any existing implementation.

| Work item | Requirements | Status | Current owner | Required independent reviewers | Gate | Evidence / next handoff |
| --- | --- | --- | --- | --- | --- | --- |
| WI-OI-037 | FR-01–FR-16, FR-17, NFR-GOV-001–003, NFR-SEC-001–006, NFR-DATA-001–004, NFR-REL-001–003, NFR-UX-001–004, NFR-OBS-001–004, NFR-OPS-001–004 | Review | SDLC Orchestrator / Requirements Spec | Architecture, QA, Security, Finance/Domain, Product | G0–G3 plan | docs/plans/audit-remediation-implementation-plan.md and submodule/package backlogs; plan review only; AR-first and one-module Build preserved; no implementation or release approval |
| WI-OI-038 | FR-01–FR-06, FR-08–FR-12, FR-14–FR-16, NFR-GOV-001–003, NFR-SEC-001–005, NFR-DATA-001–004, NFR-REL-001–003, NFR-UX-001–004, NFR-OBS-001–004, NFR-OPS-001–004 | Proposed | SDLC Orchestrator / Maintenance Domain | Architecture, Security, QA, Maintenance Domain, Product | G0 | CMMS scope/ownership correction from WI-OI-036/037; current manifest reuses solution-pack WI-OI-031; accept bounded maintenance requirements before Build |
| WI-OI-039 | FR-01–FR-06, FR-08, FR-10, FR-14–FR-16, NFR-GOV-001–003, NFR-SEC-001–005, NFR-DATA-001–004, NFR-REL-001–003, NFR-UX-001–004, NFR-OBS-001–004, NFR-OPS-001–004 | In Progress | Backend & Data / Web Experience | Architecture, Security, QA, affected Domain, Product | G3–G4 Build | Owner authorized on 2026-09-13. Canonical authenticated surface registry now exposes typed locked core-field and bounded extension-slot metadata; Studio renders core locks and rejects shadowing. The 134-screen adoption plan plus omitted assembled routes is proposed inventory only. AR remains unregistered pending DC-06 authority convergence, transactional extension persistence and immutable issue snapshot. Operational recovery, multi-replica, scale/accessibility and independent human acceptance remain open; no production acceptance authorized. |
| WI-OI-040 | FR-17-EB-01–FR-17-EB-15, FR-04/05/09/10/14/15, applicable NFRs | Proposed | SDLC Orchestrator / AR Backend & Data | Finance/Domain, Architecture, Security, Integration, QA, SRE, Product | G0–G3 | Universal work-source billing is baselined with module-owned configurable record entry, supplemental families, markup, missed billing, rebilling, templates, numbering, delivery/accounting reconciliation and portability evidence; GigaLibs has no WhooCrew API dependency and client integration follows only after freeze/replication; no Build authorization |

## Progress baseline

The full blueprint is estimated at 100 relative delivery points, including implementation and required
production evidence:

| Release | Weight | Earned | Remaining | Interpretation |
| --- | ---: | ---: | ---: | --- |
| Release 0 | 10 | 9 | 1 | Engineering discovery complete; human gate remains |
| Release 1 | 30 | 23 | 7 | Core slice plus control/execution metrics and correlation; production verification/operations remain |
| Release 2 | 20 | 2 | 18 | Reusable foundations only |
| Release 3 | 25 | 9 | 16 | Tenant/security foundations only |
| Release 4 | 15 | 1 | 14 | Strategy/architecture only |
| **Total** | **100** | **44** | **56** | **Approximately 44% complete / 56% pending by delivery effort** |

This is an engineering planning estimate, not measured labour. Re-estimate after G2 decisions, provider
selection, representative load targets and named pilot commitments.

## Authorized implementation — 2026-09-09

The owner requested implementation of WI-OI-037. WI-OI-013 is the sole active Build item for the prerequisite IAM-01/IAM-02 trust-boundary repair. AR remains the next product priority; no other module enters Build. This slice removes fabricated authentication, closes unsupported suite access paths and now includes locally certified TOTP, one-time recovery codes, domain challenge, OIDC Authorization Code + PKCE, signed tenant export, versioned control-key rollover, assisted MFA recovery, personal profile/password security and global platform-user lifecycle/RBAC administration. External enterprise-IdP interoperability/rotation, SAML, WebAuthn, regional bindings and independent acceptance remain incomplete; no module or production release is certified. See `.pi/work/WI-OI-013.md`.
