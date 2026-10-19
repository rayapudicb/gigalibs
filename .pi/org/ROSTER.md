# Roster: every role in the GigaLibs organisation

Structure and rules: [ORGANIZATION.md](ORGANIZATION.md). Definition format: [AGENT-TEMPLATE.md](AGENT-TEMPLATE.md).

**Status:**
- **Active:** working now (the pilot, WI-OI-120bl).
- **Exists:** defined before this card, in `.pi/agents/`.
- **Dormant until …:** defined here; its file is written when its wave starts.
- **Owner decides:** a module in plan v3 §7D with no card yet.

Module leads name the plan v3 §7 entry they own.

**Totals:** 112 roles.
- 19 existed before this card.
- 16 are the new active pilot: 12, plus 4 in Design, added 2026-10-19 at the owner's request.
- The other 77 are dormant, defined here and written when needed.

## 1. Product office (5)

| ID | Mission | Status |
| --- | --- | --- |
| `product_office` | Portfolio, roadmap, intake, benchmarks; keeps plan v3 and the activation of roles | **Active** |
| `agile_delivery_orchestrator` | Work-item state, gates, traceability, one writer at a time | Exists |
| `requirements_spec` | The standard for requirements quality across modules (FR/NFR links, acceptance) | Exists |
| `study_guide_sync` | Keeps status documents and guides in step | Exists |
| `commercial_packaging` | Module tiers, plans, trials, pricing | Dormant until W3 |

## 1a. Design: UX, UI and ergonomics (10)

Added 2026-10-19 at the owner's request ("you missed the design department (UX UI) ergonomics"). Design decides how
the product is used; `web_experience` (Engineering) builds it.

| ID | Mission | Status |
| --- | --- | --- |
| `design_lead` | Design direction, principles and design reviews; owns the design knowledge pack and plan v3's GU design rules | **Active** |
| `product_designer` | Flows, wireframes and screen specifications for a module's tasks (one agent, briefed per module; CMMS first) | **Active** |
| `ergonomics_human_factors` | Physical and cognitive ergonomics: technicians in the field (gloves, glare, one hand, noise, offline), desk work all day (density, fatigue, error prevention), alarms and attention; ISO 9241, ISO 6385 | **Active** |
| `design_system` | Tokens, components and patterns on `@medusajs/ui`; consistency; the `audit:design-tokens` rule; the layout findings in journeys | **Active** |
| `ux_research` | Interviews, contextual inquiry, usability tests, personas, journey maps | Dormant until the first customer, or W6 |
| `ui_visual_design` | Visual language: typography, colour, iconography, brand, light and dark | Dormant until W5 (Assistant UI) |
| `content_design` | Words in the product: labels, messages, errors, help, terminology per industry, readiness for translation | Dormant until W6 (wizard) |
| `accessibility_design` | WCAG 2.2 at design time: contrast, focus, keyboard, screen readers (pairs with `accessibility_testing`) | Dormant until W4 |
| `data_visualisation_design` | Dashboards, charts, KPIs that read correctly at a glance | Dormant until Phase 6 (analytics) or W5 |
| `service_design` | The whole service across touchpoints: QR codes on assets, email, mobile, kiosk, hand-offs between people | Dormant until the first customer, or W6 |

## 2. Business practices: module leads (33)

Each module lead is product owner, functional consultant and business analyst for its module
(ORGANIZATION.md §2.1).

### Finance (7)

| ID | Module (plan v3 §7) | Status |
| --- | --- | --- |
| `gl_record_to_report_lead` | General ledger, journals, periods, financial statements (`financial-operations`) | **Active** |
| `receivables_lead` | Customer invoices, credit, dunning, cash application (`accounts-receivable`) | Dormant until Phase 5C |
| `payables_spend_lead` | Vendor bills, three-way match, payment runs, spend (`universal-procurement` payables, `spend-management`) | Dormant until Phase 5B |
| `treasury_cash_lead` | Bank accounts, statements, reconciliation, cash position (`financial-operations` treasury, `multi-currency`) | Dormant until Phase 5A/5C |
| `costing_valuation_lead` | Cost layers, landed cost, COGS, variances (`financial-operations` costing) | Dormant until Phase 5A |
| `fixed_assets_lead` | Asset register, capitalisation, depreciation, disposal; the link to CMMS assets | Dormant until Phase 5 |
| `planning_close_consolidation_lead` | Budgets and commitments, period close, consolidation and intercompany | Dormant until Phase 5C |

### Supply chain and commercial (8)

| ID | Module | Status |
| --- | --- | --- |
| `partners_master_data_lead` | Customers, vendors, contacts, locations (Parties core) | Dormant until Phase 5B (T4) |
| `product_pricing_lead` | Catalogue, units, price lists, discounts (`product-catalogue`) | Dormant until Phase 4 (S3, S4) |
| `order_to_cash_lead` | Quotes, sales orders, fulfilment, shipments (`universal-orders`) | Dormant until Phase 5C |
| `procure_to_pay_lead` | Requisitions, purchase orders, receipts (`universal-procurement`) | Dormant until Phase 5B |
| `inventory_warehouse_lead` | Warehouses, locations, stock, lots and serials, counts, availability (`universal-inventory`) | Dormant until Phase 5A |
| `logistics_shipping_lead` | Carriers, shipments, tracking, freight cost | Owner decides (§7D) |
| `returns_rma_lead` | Return authorisations, inspection, credits (U26) | Dormant until Phase 6 |
| `commerce_lead` | Cart, checkout, payments through a gateway adapter | Owner decides (§7D) |

### Operations and assets (7)

| ID | Module | Status |
| --- | --- | --- |
| `maintenance_cmms_lead` | Assets, requests, work orders, preventive maintenance, meters, parts, sign-off (`physical-operations-cmms`) | **Active** |
| `workforce_scheduling_lead` | People, availability, bookings, time (`gigaops`) | Dormant until Phase 2/6 |
| `places_geospatial_lead` | Sites, spaces, maps, one place identity (`geospatial`, T3) | Dormant until step 1.2 |
| `manufacturing_lead` | Bills of materials, production, MRP (U24) | Dormant until Phase 6 |
| `projects_lead` | Projects, phases, tasks, project costs (U25) | Dormant until Phase 6 |
| `quality_management_lead` | Inspections, non-conformance, corrective actions | Owner decides (§7D) |
| `field_mobile_lead` | Technicians offline: work, time, evidence (U27, X7) | Dormant until Phase 6 |

### People (1)

| ID | Module | Status |
| --- | --- | --- |
| `people_hr_lead` | HR beyond Workforce: recruiting, performance, learning (statutory payroll stays out of scope unless the owner decides) | Owner decides (§7D) |

### Customer and service (3)

| ID | Module | Status |
| --- | --- | --- |
| `crm_revenue_lead` | Leads, opportunities, pipeline, campaigns | Owner decides (§7D) |
| `service_desk_lead` | Tickets, SLAs, knowledge base | Owner decides (§7D) |
| `communications_lead` | Notifications and omnichannel messages (`communications`) | Dormant until Phase 6 (email deferred, W2 decision) |

### Platform business (7)

| ID | Module | Status |
| --- | --- | --- |
| `workspaces_accounts_lead` | Workspaces, members, roles, enterprise accounts, organisation and units, plans (§7A 1–5) | Dormant until W2 |
| `metadata_studio_lead` | Application Dictionary, Configuration Studio, windows (§7A 7) | Dormant until Phase 4 |
| `workflow_approvals_lead` | Workflows, approvals, rules (`workflow-studio`, Approval Queue, `universal-rule-pro`) | Dormant until Phase 4/6 |
| `analytics_reporting_lead` | Reports, dashboards, the Business Value Ledger (`analytics-studio`) | Dormant until Phase 6 |
| `integrations_lead` | Connectors, data contracts, imports and exports (`universal-connector-hub`, `universal-data-studio`) | Dormant until Phase 6 |
| `documents_lead` | E-signature, scanning, document intelligence | Dormant until Phase 6 |
| `assistant_product_lead` | The GigaLibs Assistant's product scope (GU1–GU7) | Dormant until W5 |

## 3. Industry practices (13)

One lead and one knowledge pack per sector. Each writes the sector's solution blueprint (plan v3 §7C industry packs).

| ID | Sector (and the plan's packs it covers) | Status |
| --- | --- | --- |
| `industry_manufacturing` | Discrete and process manufacturing; plant maintenance (plan: manufacturing) | **Active** |
| `industry_facilities_real_estate` | Facilities management, real estate, campuses (the first CMMS customers) | **Active** |
| `industry_pharma_life_sciences` | GMP, validated systems, batch and calibration records | Dormant until a customer or target |
| `industry_healthcare` | Hospitals and clinics: biomedical equipment, facilities, compliance (plan: healthcare) | Dormant |
| `industry_agriculture_food` | Farms, food processing, traceability (plan: agriculture) | Dormant |
| `industry_retail_qsr` | Stores, quick-service restaurants, e-commerce (plan: QSR) | Dormant |
| `industry_hospitality` | Hotels and resorts: rooms, engineering, housekeeping | Dormant |
| `industry_sports_leisure_events` | Venues, clubs, events, event staffing (plan: event staffing) | Dormant |
| `industry_it_professional_services` | IT services, consulting: projects, time, SLAs | Dormant |
| `industry_construction_engineering` | Projects, sites, equipment, subcontractors (plan: construction) | Dormant |
| `industry_transport_logistics` | Logistics, warehousing, transit and rail, crews (plan: logistics, warehouse, JP metro industrial, travel crew) | Dormant |
| `industry_utilities_energy` | Networks, plants, field crews, regulated assets | Dormant |
| `industry_public_sector_education` | Councils, schools, universities: facilities, assets, procurement rules | Dormant |

## 4. Centres of expertise (14)

| ID | Expertise | Status |
| --- | --- | --- |
| `accounting_standards_specialist` | IFRS, US GAAP, Ind AS and other local GAAP: recognition, measurement, disclosure | **Active** |
| `financial_mathematics_specialist` | Rounding, currency precision, allocation, depreciation, costing, interest; property tests that prove them | **Active** |
| `reliability_engineering_specialist` | Maintenance strategy, RCM, FMEA, MTBF and MTTR, failure coding, ISO 55000 and ISO 14224 | **Active** |
| `tax_specialist` | Indirect tax and e-invoicing, one pack per country (plan country packs: AU, EU, GB, IN, JP, US; GCC when needed) | Dormant until Phase 5 |
| `internal_controls_specialist` | Separation of duties, approvals, control design, audit trail | Dormant until Phase 5 |
| `currency_fx_specialist` | Rates, revaluation, translation, multi-currency documents | Dormant until Phase 5A |
| `supply_chain_planning_specialist` | Availability, reorder points, safety stock, forecasting, MRP logic | Dormant until Phase 5A |
| `trade_customs_specialist` | Incoterms, HS codes, duties, landed cost inputs | Dormant until Phase 5B |
| `health_safety_environment_specialist` | Permits to work, lockout, incidents, inspections, ISO 45001 and 14001 | Dormant until CMMS M-CM2 |
| `quality_regulatory_specialist` | ISO 9001, GMP, 21 CFR Part 11, EU Annex 11, validation | Dormant until a regulated customer |
| `master_data_specialist` | Identity, duplicates, merges, data standards (GS1) | Dormant until Phase 5B |
| `privacy_specialist` | GDPR, India's DPDP Act, HIPAA, at design time | Dormant until W2/W3 |
| `payroll_labour_specialist` | Payroll and labour law, one pack per country | Dormant (payroll out of scope unless the owner decides) |
| `localisation_specialist` | Languages, scripts, formats, calendars, right-to-left | Dormant until the first non-English customer |

## 5. Engineering (15)

| ID | Mission | Status |
| --- | --- | --- |
| `solution_architecture` | Boundaries, ADRs, data ownership, migrations | Exists |
| `api_contracts` | API, event and manifest schemas, errors, idempotency, versions | Exists |
| `backend_domain` | Services, APIs, transactions, migrations, jobs | Exists |
| `web_experience` | Screens, journeys, all states, accessibility | Exists |
| `plugin_runtime` | Workflow runtime, manifests, scheduler, AI abstraction | Exists |
| `integration_connectors` | External systems, webhooks, retries, reconciliation | Exists |
| `communication_orchestration` | Notification intent, channels, delivery | Exists |
| `tenant_identity_access` | Workspaces, identities, roles, scopes, credentials | Exists |
| `data_portability` | Classification, lineage, export and import, retention | Exists |
| `trust_safety_automation` | Safety tiers, approvals, limits for AI and consequential actions | Exists |
| `developer_platform` | SDKs, manifests, `module:new`, developer workflow | Exists |
| `tenant_config` | Desired-state configuration with dry-run | Exists (dormant until WI-OI-013) |
| `data_engineering` | Data models, query performance, reporting data, migration review | Dormant until Phase 5 |
| `ai_engineering` | The Assistant: tools, grounding, evaluation of answers | Dormant until W5 |
| `mobile_offline_engineering` | Mobile and offline apps | Dormant until Phase 6 (U27) |

## 6. Quality (5)

| ID | Mission | Status |
| --- | --- | --- |
| `qa_spec` | Test strategy, traceability, negative and recovery cases, Go/No-Go | Exists |
| `test_automation` | The Playwright journeys, run comparison, regression suites | Dormant until W1 ends (then active) |
| `performance_testing` | Load and response-time budgets | Dormant until W4 |
| `accessibility_testing` | WCAG checks; the 17 open contrast findings | Dormant until W4 |
| `uat_coordinator` | Business acceptance with named users | Dormant until the first customer |

## 7. Independent review and risk (5)

| ID | Mission | Status |
| --- | --- | --- |
| `security_reviewer` | Read-only Security review before every deploy | **Active** |
| `code_reviewer` | Correctness, simplicity, consistency; no fakes, no hard-coding, no weakened tests | **Active** |
| `finance_controls_reviewer` | Postings, balances, periods, controls; prepares the accountant's packet | **Active** |
| `licence_ip_reviewer` | Licences of dependencies and references; no copied code or text | **Active** |
| `privacy_compliance_reviewer` | Personal data, retention, consent, regulated data | Dormant until W3 |

## 8. Platform operations (6)

| ID | Mission | Status |
| --- | --- | --- |
| `release_operations` | Release worktree, builds, versions, migrations, rollout and rollback | Exists |
| `infrastructure_observability` | Topology, logs, metrics, traces, SLOs, alerts, runbooks | Exists |
| `security_engineering` | Threat models; code, dependency, secret and image scanning (O5) | Dormant until W2/W4 |
| `incident_sre` | On-call, incident response, post-incident reviews | Dormant until W4 |
| `backup_recovery` | Automatic backups, restore drills, recovery per migration (O2) | Dormant until W4 |
| `capacity_cost` | Disk, memory, compute and cost | Dormant until W4 |

## 9. Customer operations: BAU (6)

| ID | Mission | Status |
| --- | --- | --- |
| `documentation_enablement` | Setup, API, operator docs, runbooks | Exists |
| `support_desk` | L1/L2 triage; real defects become cards | Dormant until W4 |
| `incident_problem_manager` | Customer-facing incidents, root causes, problem records | Dormant until W4 |
| `change_manager` | Release calendar, change approval, announcements | Dormant until W4 |
| `onboarding_data_migration` | Set-up, configuration, moving data from the customer's old systems | Dormant until W6 |
| `customer_success_training` | Guides, training, release notes, adoption | Dormant until W6 |
