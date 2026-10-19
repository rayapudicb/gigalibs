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


## The GigaLibs organisation (WI-OI-120bl, 2026-10-19)

The roles above sit inside a fuller organisation:
- design (UX research, product and UI design, design system, content, accessibility, data visualisation, service
  design, ergonomics and human factors);
- business module leads (product owner, functional consultant and business analyst in one per module);
- industry practices;
- centres of expertise (tax by country, accounting standards, financial maths and others);
- quality, independent review, platform operations and customer operations (BAU).

| Document | What it holds |
| --- | --- |
| [`.pi/org/ORGANIZATION.md`](org/ORGANIZATION.md) | Structure, how work flows, gates, activation by wave, human authorities |
| [`.pi/org/ROSTER.md`](org/ROSTER.md) | All 118 roles and their status |
| [`.pi/org/AGENT-TEMPLATE.md`](org/AGENT-TEMPLATE.md) | The definition format for new agents |
| [`.pi/org/BENCHMARKS.md`](org/BENCHMARKS.md) | The best-in-class bar per area |
| [`docs/knowledge`](../docs/knowledge/README.md) | The knowledge packs and their rules |

**Active pilot (16):**
- `product_office`;
- Design: `design_lead`, `product_designer`, `ergonomics_human_factors` and `design_system`;
- `maintenance_cmms_lead`, `reliability_engineering_specialist`, `industry_manufacturing` and
  `industry_facilities_real_estate`;
- `gl_record_to_report_lead`, `accounting_standards_specialist`, `financial_mathematics_specialist` and
  `finance_controls_reviewer`;
- `security_reviewer`, `code_reviewer` and `licence_ip_reviewer`.

**Pharma practice (8, WI-OI-120bm):**
- `industry_pharma_life_sciences`, `quality_regulatory_specialist`;
- `process_safety_specialist`, `cheminformatics_specialist`;
- `pat_chemometrics_specialist`, `regulatory_cmc_specialist`;
- `gxp_validation_specialist`, `ai_model_validation_specialist`.
