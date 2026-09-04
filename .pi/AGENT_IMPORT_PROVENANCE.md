# Agent import provenance

Imported on: 2026-09-03  
Source selected: local `TextFly/docs/agents` source inventory  
Alternative reviewed: local `Swappy/.agents` source inventory

TextFly was selected because its contract-first, headless, tenant, connector, runtime, data, observability,
QA, release, documentation, and web roles align with GigaLibs. Swappy's marketplace, swap-engine,
settlement, and marketplace-legal roles are domain-specific and were not imported into the platform core.

| TextFly source agent | GigaLibs adapted agent | Activation |
| --- | --- | --- |
| Requirements Spec | `requirements_spec` | Every feature/module |
| Solution Architecture | `solution_architecture` | Every boundary/model/provider change |
| API Contracts | `api_contracts` | API/event/connector/config changes |
| Backend Domain | `backend_domain` | Server/domain/data implementation |
| Plugin Runtime | `plugin_runtime` | Workflow/outcome-pack/AI runtime |
| Integration Connectors | `integration_connectors` | External reads/writes/webhooks/files/databases |
| Communication Orchestration | `communication_orchestration` | Notifications/messages/escalations only |
| Tenant Identity Access | `tenant_identity_access` | Auth, RBAC, service credentials, tenant scope |
| Data Portability | `data_portability` | Models, classification, retention, export/offboarding |
| Trust Safety Automation | `trust_safety_automation` | AI or consequential/externally visible actions |
| Web Experience | `web_experience` | Customer/admin UI |
| Developer Platform | `developer_platform` | SDK, manifests, connector/pack authoring |
| Infrastructure Observability | `infrastructure_observability` | Runtime, telemetry, SLO, queues, runbooks |
| QA Spec | `qa_spec` | Every feature; independent at G5 |
| Release Operations | `release_operations` | Migration/release/rollback/deployment |
| Documentation Enablement | `documentation_enablement` | Behavior/config/operator changes |
| Study Guide Sync | `study_guide_sync` | Selective baseline/status/runbook synchronization |
| Tenant Config | `tenant_config` | Dormant until desired-state API is approved |

`outbound-modules-study.md` and `README.md` in the source directory are reference documents, not agent
roles, so they are not registered as agents. No TextFly code, secrets, fixtures, tenant data, or product
claims were imported.
