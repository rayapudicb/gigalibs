# GigaLibs SDLC agent catalog

Agents are bounded delivery roles. They produce or independently review evidence; they do not replace
human product, security-risk, legal, financial, or release authorities.

| Agent ID | Primary ownership | Activation |
| --- | --- | --- |
| `agile_delivery_orchestrator` | WIP, work-item state, gates, traceability and outcome feedback | Every module |
| `requirements_spec` | Outcomes, stories, FR/NFR, acceptance, metrics and non-goals | Every module |
| `solution_architecture` | Boundaries, ADRs, data ownership, compatibility and migration design | Every module |
| `api_contracts` | REST/event/connector/manifest schemas, errors, idempotency and versioning | Contract change |
| `backend_domain` | Domain services, API implementation, transactions, models, migrations and jobs | Backend/data change |
| `plugin_runtime` | Workflow/outcome runtime, manifests, scheduler, AI abstraction and decision lifecycle | Runtime/AI/pack change |
| `integration_connectors` | External reads/writes, auth, webhooks, mapping, retry and reconciliation | Integration change |
| `communication_orchestration` | Notification intent, audience/template/channel/fallback and delivery lifecycle | Communication only |
| `tenant_identity_access` | Tenants, human/service identity, RBAC/scopes, credentials and revocation | Identity or protected path |
| `data_portability` | Classification, lineage, export/import, retention, hold and offboarding | Data/model change |
| `trust_safety_automation` | Safety tier, approval, limits, override, misuse and action policy | AI/consequential action |
| `web_experience` | API-backed UI journeys, all states, responsive behavior and accessibility | User-facing change |
| `developer_platform` | SDKs, pack/connector manifests, app registration and developer workflow | Extension surface |
| `infrastructure_observability` | Runtime topology, logs, metrics, traces, SLOs, alerts and runbooks | Operational change |
| `qa_spec` | Independent test design, traceability, negative/recovery evidence and recommendation | Every module |
| `release_operations` | CI/CD, versions, migrations, artifacts, rollout, halt and recovery | Every release |
| `documentation_enablement` | Setup, API/integration/operator docs, runbooks and troubleshooting | Behavior/config change |
| `study_guide_sync` | Minimal baseline/status/guide synchronization | End of affected change |
| `tenant_config` | Desired-state API configuration with dry-run and safe secret/provider stops | Dormant until WI-OI-013 |

The 18 non-orchestrator roles are complete adaptations of the TextFly roster. See
`.pi/AGENT_IMPORT_PROVENANCE.md`. Every role definition is stored at `.pi/agents/<agent-id>/AGENT.md`.

## Independent review rule

The implementation producer cannot be the sole reviewer for tenancy, authentication, permissions,
secrets, classification/retention, AI, financial value, migrations, external actions, infrastructure or
release. The orchestrator coordinates but cannot substitute for that review.

