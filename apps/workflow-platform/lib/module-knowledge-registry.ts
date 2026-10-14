/**
 * Central Business Taxonomy & Knowledge Hub Registry
 *
 * Maps every application route to:
 * - A clean, single-line business title (zero techno-jargon)
 * - Breadcrumb category
 * - Executive summary of what the capability achieves
 * - Key operational actions to perform
 * - Operational guardrails and governance notes
 * - Collapsible system specifications for technical operators
 */

export interface ModuleKnowledgeEntry {
  category: string;
  businessTitle: string;
  summary: string;
  actions: string[];
  guardrails: string[];
  technicalSpec?: {
    serviceName: string;
    port?: string;
    schema?: string;
    primaryStandards?: string[];
  };
}

export const MODULE_KNOWLEDGE_REGISTRY: Record<string, ModuleKnowledgeEntry> = {
  // ── Operations & Workforce (GigaOps) ──
  '/gigaops': {
    category: 'Workforce Operations',
    businessTitle: 'Workforce Operations Overview',
    summary: 'Executive control of plant and field labor, verified qualifications, shift capacity, and operational workforce status.',
    actions: [
      'Audit total active floor workforce and operational team headcount',
      'Verify capability coverage against plant station requirements',
      'Track worker certification expirations and safety compliance',
      'Review real-time labor utilization across active shifts',
    ],
    guardrails: [
      'Worker assignments require verified qualifications in good standing',
      'Zero invented labor hours; all time records originate from verified physical or biometric punches',
      'Tenancy and department isolation strictly enforced at the data layer',
    ],
    technicalSpec: {
      serviceName: 'GigaOps Workforce Plane',
      port: '4700',
      schema: 'gigalibs_workforce',
      primaryStandards: ['ISO 45001 Safety Management', 'FLSA Compliance'],
    },
  },
  '/gigaops/scheduling': {
    category: 'Workforce Operations',
    businessTitle: 'Shift Scheduling & Station Roster',
    summary: 'Plan and balance multi-shift rosters across production lines, work cells, and workstations without fatigue or rest-period breaches.',
    actions: [
      'Create and publish shift rosters for Morning, Evening, and Night rotations',
      'Assign certified operators to specific machinery and production lines',
      'Identify skill shortages and unassigned safety-critical stations',
      'Enforce mandatory turnaround hours between consecutive shifts',
    ],
    guardrails: [
      'Rotations enforce minimum rest turnaround policies before shift publishing',
      'Station qualifications verified at the moment of assignment',
      'Schedule changes are immutably audited with supervisor timestamp',
    ],
    technicalSpec: {
      serviceName: 'GigaOps Workforce Plane',
      port: '4700',
      schema: 'gigalibs_workforce',
      primaryStandards: ['Working Time Directive', 'OSHA Rest Period Guidelines'],
    },
  },
  // WI-OI-120an: describes the real Time & attendance screen and only what the Workforce API enforces
  // (modules/gigaops/apps/api/src/time/time.service.ts). It used to describe a retired demo screen and promise signed
  // GPS and an anti-tamper clock that do not exist.
  '/gigaops/time': {
    category: 'Workforce Operations',
    businessTitle: 'Time & Attendance',
    summary: 'Clock in and out at a site, review and submit the weekly timesheet, approve the weeks of others, and resolve time exceptions.',
    actions: [
      'Clock in, take breaks and clock out; when you pick a site and share your location, the punch is checked against that site\'s boundary',
      'Review the week built from your punches and submit it for approval',
      'Approve or return the submitted weeks of others (if your role may approve timesheets)',
      'Resolve time exceptions, void a wrong punch or add a missed one, with a reason (if your role may manage time)',
    ],
    guardrails: [
      'Location and time come from the device\'s browser and are not tamper-proof',
      'Flagged for a manager: punches outside the chosen site, at a site that could not be checked, at a site without a location, sent late, or after the week was submitted',
      'Not checked: punches with no site, and punches at a site with no boundary drawn',
      'A punch made offline is kept on this device and sent later with its original time; a resend never records twice',
      'Another manager decides, corrects or resolves your own time; nobody approves a week they submitted or their own',
      'An approved week cannot change, and corrections are refused for punches dated in a submitted or approved week',
      'Corrections are added, never overwritten, and each carries a reason code and a note',
    ],
  },
  '/gigaops/resources': {
    category: 'Workforce Operations',
    businessTitle: 'Resource & Talent Directory',
    summary: 'Comprehensive register of human operators, specialized maintenance crews, and contracted labor pools.',
    actions: [
      'Register internal employees, specialized contractors, and machine crews',
      'View individual qualification portfolios, security clearances, and permits',
      'Manage contractor agreements and verified badge credentials',
      'Organize multidisciplinary response teams for rapid maintenance dispatch',
    ],
    guardrails: [
      'PII data encrypted at rest and masked in compliance with data privacy standards',
      'Contractor work rights validated against regional labor regulations',
    ],
    technicalSpec: {
      serviceName: 'GigaOps Workforce Plane',
      port: '4700',
      schema: 'gigalibs_workforce',
    },
  },
  '/gigaops/capabilities': {
    category: 'Workforce Operations',
    businessTitle: 'Skills & Safety Qualifications',
    summary: 'Governed catalog of industrial certifications, technical proficiencies, safety licenses, and compliance credentials.',
    actions: [
      'Define standard industrial capability codes (e.g. Electrical L3, High-Voltage LOTO)',
      'Assign verified certifications with evidence document attachment',
      'Set automated expiry alerts 60, 30, and 15 days prior to lapse',
      'Suspend capabilities immediately upon safety incident investigation',
    ],
    guardrails: [
      'High-risk work orders strictly block dispatch of uncertified personnel',
      'Qualification revocations immediately revoke dependent dispatch permissions',
    ],
    technicalSpec: {
      serviceName: 'GigaOps Workforce Plane',
      port: '4700',
      schema: 'gigalibs_workforce',
    },
  },

  // ── Physical Operations & Maintenance (CMMS) ──
  '/cmms': {
    category: 'Asset & Maintenance',
    businessTitle: 'Equipment & Maintenance Overview',
    summary: 'Executive overview of equipment uptime, active preventive maintenance cycles, critical work orders, and MRO spare parts availability.',
    actions: [
      'Review Mean Time to Repair (MTTR) and Mean Time Between Failures (MTBF)',
      'Monitor overdue preventive maintenance tasks across production units',
      'Track urgent corrective work orders and technician allocations',
      'Inspect critical spare part stock levels against reorder thresholds',
    ],
    guardrails: [
      'All maintenance records linked to authoritative asset tags and spatial nodes',
      'Completed work orders require verified technician sign-off and photo proof',
    ],
    technicalSpec: {
      serviceName: 'Asset & Maintenance Core',
      port: '4200',
      schema: 'gigalibs_cmms',
      primaryStandards: ['ISO 55000 Asset Management', 'CFR 1910.147 LOTO'],
    },
  },
  '/cmms/work-orders': {
    category: 'Asset & Maintenance',
    businessTitle: 'Work Orders & Maintenance Execution',
    summary: 'Raise, dispatch, execute, and sign off on preventive and corrective maintenance jobs with photo evidence and digital permits.',
    actions: [
      'Generate corrective work orders from operator rounds or IoT threshold alerts',
      'Dispatch qualified technicians based on required certifications',
      'Attach digital Lockout/Tagout (LOTO) and Permit to Work (PTW) safety forms',
      'Log consumed spare parts, actual labor hours, and failure cause codes',
    ],
    guardrails: [
      'High-energy equipment work orders enforce mandatory LOTO verification before start',
      'Labor hours logged automatically update work unit cost ledgers',
    ],
    technicalSpec: {
      serviceName: 'Asset & Maintenance Core',
      port: '4200',
      schema: 'gigalibs_cmms',
    },
  },
  '/cmms/assets': {
    category: 'Asset & Maintenance',
    businessTitle: 'Asset Register & Digital Twin',
    summary: 'Hierarchical equipment register anchoring machinery, rotating equipment, and critical assets to physical plant locations.',
    actions: [
      'Navigate the parent-child asset hierarchy (e.g. Line › Motor › Gearbox › Bearing)',
      'Track equipment nameplate data, manufacturer serials, and warranty terms',
      'View complete historical work order and modification timeline for any machine',
      'Associate IoT vibration and temperature telemetry sensors with physical assets',
    ],
    guardrails: [
      'Equipment codes must remain unique within tenant space',
      'Asset decommissions preserve full historical maintenance and audit trails',
    ],
    technicalSpec: {
      serviceName: 'Asset & Maintenance Core',
      port: '4200',
      schema: 'gigalibs_cmms',
    },
  },

  // ── Geospatial & Estate Topology ──
  '/maps': {
    category: 'Sites & Topology',
    businessTitle: 'Sites & Spatial Topology',
    summary: 'Single authoritative hierarchy for physical estates: global regions, production facilities, operating lines, and inspection checkpoints.',
    actions: [
      'Model physical plant hierarchy from country down to individual machine work cells',
      'Bulk import estate locations via CSV spreadsheet with instant row validation',
      'Configure geofence boundary coordinates for automatic mobile muster check-in',
      'Drill down into operational rollups and downtime KPIs by physical location',
    ],
    guardrails: [
      'High-performance ltree indexing ensures sub-10ms queries across 50,000+ nodes',
      'Spatial scope claims restrict supervisors strictly to their assigned facilities',
    ],
    technicalSpec: {
      serviceName: 'Geospatial Studio API',
      port: '4720',
      schema: 'gigalibs_geospatial',
      primaryStandards: ['PostGIS 3.4', 'GeoJSON RFC 7946', 'PostgreSQL ltree'],
    },
  },

  // ── Studio & Process Orchestration ──
  '/workflows': {
    category: 'Studio & Orchestration',
    businessTitle: 'Workflow Automation & DAGs',
    summary: 'Visual process pipelines uniting business rules, human approvals, and cross-system integrations into deterministic automated flows.',
    actions: [
      'Design event-driven workflows connecting sensors, ERPs, and workforce dispatch',
      'Configure automated conditional branching, SLA timers, and escalation paths',
      'Test DAG pipelines interactively with real payload replay',
      'Publish versioned workflows with zero-downtime execution cutover',
    ],
    guardrails: [
      'Executions are durable and idempotent; network interruptions resume cleanly',
      'External side effects enforce circuit breakers and rate limiters',
    ],
    technicalSpec: {
      serviceName: 'Workflow Engine Core',
      port: '4000',
      schema: 'gigalibs_workflow',
      primaryStandards: ['BPMN 2.0 Semantics', 'Deterministic DAG Execution'],
    },
  },
  '/rules': {
    category: 'Studio & Orchestration',
    businessTitle: 'Business Decision Rules',
    summary: 'Centralized rule engine managing dynamic thresholds, risk calculations, routing policies, and compliance guardrails.',
    actions: [
      'Author declarative decision rules using business-friendly expression syntax',
      'Simulate rules against historical telemetry and operational event logs',
      'Set automated emergency kill-switches and temporary policy overrides',
      'Track rule version history with cryptographic change receipts',
    ],
    guardrails: [
      'Rules execute in sandboxed AST runtime preventing infinite loops or memory leaks',
      'Every rule evaluation records the triggering input and resulting decision fact',
    ],
    technicalSpec: {
      serviceName: 'Universal Rule Pro',
      port: '3900',
      schema: 'gigalibs_rules',
    },
  },
  '/forms': {
    category: 'Studio & Orchestration',
    businessTitle: 'Digital Forms & Inspections',
    summary: 'Build and deploy responsive operational checklists, safety permits, operator rounds, and customer-facing data collection forms.',
    actions: [
      'Select from production-tested inspection, safety permit, and survey templates',
      'Add dynamic fields: gauge dials, camera captures, GPS stamps, and signatures',
      'Embed dynamic calculation formulas and conditional field display logic',
      'Generate shareable links or embed forms directly into mobile worker apps',
    ],
    guardrails: [
      'Form submissions validate server-side against schema constraints',
      'Offline submissions stored in encrypted mobile cache and synced on reconnect',
    ],
    technicalSpec: {
      serviceName: 'Dynamic Forms Core',
      port: '4000',
      schema: 'gigalibs_forms',
    },
  },
  '/data-contracts': {
    category: 'Studio & Orchestration',
    businessTitle: 'Data Exchange & Contracts',
    summary: 'Governed data contract registry preventing cross-system schema drift between ERPs, MES, IoT streams, and operational databases.',
    actions: [
      'Register versioned JSON/Protobuf contracts for inbound and outbound interfaces',
      'Detect breaking schema modifications before deployment to production',
      'Inspect end-to-end data lineage across ERP, telemetry, and reporting pipelines',
      'Enforce type safety across heterogeneous external provider feeds',
    ],
    guardrails: [
      'Breaking contract changes require deprecation notice and backwards compatibility',
      'Schema violations quarantine payloads to the DLQ instead of corrupting data',
    ],
    technicalSpec: {
      serviceName: 'Universal Data Studio',
      port: '3800',
      schema: 'gigalibs_data_studio',
    },
  },
  '/connectors': {
    category: 'Studio & Orchestration',
    businessTitle: 'Enterprise Integrations',
    summary: 'Pre-built enterprise connectors linking GigaLibs to SAP S/4HANA, NetSuite, Salesforce, AVEVA PI, and IoT broker endpoints.',
    actions: [
      'Configure bi-directional sync with corporate ERP and financial backends',
      'Establish authenticated webhook endpoints for industrial SCADA and edge gateways',
      'Monitor real-time connector health, API latency, and quota utilization',
      'Rotate OAuth credentials and API tokens with zero integration downtime',
    ],
    guardrails: [
      'Credentials encrypted at rest using AES-256-GCM envelope encryption',
      'Automated exponential backoff and jitter on external provider rate limits',
    ],
    technicalSpec: {
      serviceName: 'Universal Connector Hub',
      port: '4100',
      schema: 'gigalibs_connector',
    },
  },

  // ── Communications & Dispatch ──
  '/communications': {
    category: 'Communications & Dispatch',
    businessTitle: 'Operations Communications',
    summary: 'Two-way emergency dispatch, SMS/WhatsApp operational alerts, push notifications, and shift broadcast messaging.',
    actions: [
      'Broadcast plant-wide emergency or shift change notifications via SMS and WhatsApp',
      'Receive inbound operator status replies directly into the unified 2-way inbox',
      'Configure automated notification triggers on high-severity machine alarms',
      'Review message delivery receipts and carrier acknowledgment logs',
    ],
    guardrails: [
      'Telephony carrier throttling strictly respected to avoid carrier blacklisting',
      'Emergency broadcast channels bypass worker do-not-disturb preferences',
    ],
    technicalSpec: {
      serviceName: 'Communications Plane (TextFly)',
      port: '4700',
      schema: 'gigalibs_communications',
      primaryStandards: ['Twilio Carrier Gateway', 'Azure Communication Services'],
    },
  },

  // ── Financial Operations & Accounting ──
  '/ar': {
    category: 'Financial Operations',
    businessTitle: 'Accounts Receivable',
    summary: 'Customer billing ledger, automated invoice generation, payment collections, and CECL aging compliance.',
    actions: [
      'Issue immutable customer invoices linked to verified service delivery milestones',
      'Track aging buckets (Current, 30, 60, 90+ days) and cash collection velocity',
      'Manage billing disputes and credit note issuance with audit approvals',
      'Reconcile inbound bank remittances against outstanding receivables',
    ],
    guardrails: [
      'Invoices follow strict sequence numbering with tamper-evident audit receipts',
      'Revisions create versioned superseding documents; invoices are never deleted',
    ],
    technicalSpec: {
      serviceName: 'AR Domain Service',
      port: '3400',
      schema: 'gigalibs_ar',
      primaryStandards: ['GAAP Revenue Recognition', 'ASC 606 Compliance'],
    },
  },
  '/ap': {
    category: 'Financial Operations',
    businessTitle: 'Invoice Matching & AP',
    summary: 'Automated 3-way matching of purchase orders, receiving slips, and supplier invoices to prevent duplicate payments and price creep.',
    actions: [
      'Ingest vendor invoices via automated OCR document scanning',
      'Execute deterministic 3-way match against Goods Receipts and Purchase Orders',
      'Automatically hold invoices with price variance, quantity shortage, or tax discrepancies',
      'Approve clean invoices for automated payment posting to general ledger',
    ],
    guardrails: [
      'Discrepancies exceeding variance threshold require authorized manager override',
      'Duplicate vendor tax ID and invoice number checks execute before posting',
    ],
    technicalSpec: {
      serviceName: 'Spend Management Plane',
      port: '3500',
      schema: 'gigalibs_spend',
    },
  },
  '/spend': {
    category: 'Financial Operations',
    businessTitle: 'Spend & Budget Management',
    summary: 'Departmental budget tracking, employee expense reports, and multi-tier purchase authorization workflows.',
    actions: [
      'Manage departmental cost centers and capital expenditure (CapEx) budgets',
      'Review and approve operational purchase requisitions with policy validation',
      'Audit employee expense claims with receipt OCR verification',
      'Track real-time budget burn rate and forecast end-of-quarter variance',
    ],
    guardrails: [
      'Spending requests exceeding budget limits trigger executive approval escalation',
      'Audit log tracks requestor, approver, and currency conversion rate',
    ],
    technicalSpec: {
      serviceName: 'Spend Management Plane',
      port: '3500',
      schema: 'gigalibs_spend',
    },
  },
  '/tax': {
    category: 'Financial Operations',
    businessTitle: 'Tax & Compliance Engine',
    summary: 'Multi-jurisdiction sales, excise, and VAT calculation with exemption certificates and nexus threshold monitoring.',
    actions: [
      'Configure tax jurisdictions across federal, state, and municipal authorities',
      'Maintain active tax exemption certificates for B2B and agricultural clients',
      'Monitor economic nexus thresholds to identify new tax filing obligations',
      'Generate audit-ready tax determination receipts for statutory tax filings',
    ],
    guardrails: [
      'Tax calculations are deterministic and freeze effective rate snapshots on invoices',
      'Exemption certificates require verified expiration dates and jurisdiction codes',
    ],
    technicalSpec: {
      serviceName: 'Tax Configuration Engine',
      port: '3600',
      schema: 'gigalibs_tax',
    },
  },
  '/currency': {
    category: 'Financial Operations',
    businessTitle: 'Treasury & FX Management',
    summary: 'Multi-currency ledger conversions, central bank foreign exchange rates, and international settlement preferences.',
    actions: [
      'Maintain certified daily FX exchange rates from authoritative central banks',
      'Convert foreign currency transactions using ISO 4217 minor-unit integer arithmetic',
      'Lock exchange rate snapshots on long-term contracts and purchase orders',
      'Configure tenant display currency and regional number formatting',
    ],
    guardrails: [
      'Zero floating-point rounding errors; all financial conversions use exact minor-unit integers',
      'Historic transactions preserve their locked transaction-date exchange rate',
    ],
    technicalSpec: {
      serviceName: 'Currency & FX Service',
      port: '3700',
      schema: 'gigalibs_currency',
      primaryStandards: ['ISO 4217 Currency Codes'],
    },
  },
  '/recovery': {
    category: 'Financial Operations',
    businessTitle: 'Revenue Assurance & Recovery',
    summary: 'Autonomous discovery and recovery of unbilled work, freight overcharges, duplicate vendor fees, and contract leakage.',
    actions: [
      'Scan work order completions against billed invoices to uncover unbilled revenue',
      'Detect freight surcharge markups exceeding contractual caps',
      'Review automated recovery opportunities backed by verifiable source lineage',
      'Initiate recovery clawback workflows with approved documentation receipts',
    ],
    guardrails: [
      'Every recovery opportunity requires traceable source document evidence',
      'Clawback actions require human controller authorization before ERP posting',
    ],
    technicalSpec: {
      serviceName: 'Autonomous Recovery Studio',
      port: '4200',
      schema: 'gigalibs_recovery',
    },
  },

  // ── Executive Intelligence & Reporting ──
  '/analytics': {
    category: 'Intelligence & Reporting',
    businessTitle: 'Operational Intelligence & KPIs',
    summary: 'Executive control tower delivering plant reliability, shift productivity, maintenance backlog, and financial performance insights.',
    actions: [
      'Analyze equipment Overall Equipment Effectiveness (OEE) across plants',
      'Compare labor efficiency and shift output trends over time',
      'Identify recurring machine component failures and root causes',
      'Export certified operational metrics for board and management reviews',
    ],
    guardrails: [
      'Analytics queries run against read replicas and rollups to protect transaction performance',
      'Metrics enforce tenant and spatial scope isolation at the database layer',
    ],
    technicalSpec: {
      serviceName: 'Analytics Studio Service',
      port: '4400',
      schema: 'gigalibs_analytics',
    },
  },

  // ── Trust, Security & Execution Monitoring ──
  '/esign': {
    category: 'Trust & Governance',
    businessTitle: 'Digital Authorizations & Signatures',
    summary: 'Legally binding cryptographic electronic signatures for permits to work, safety sign-offs, shift handovers, and executive approvals.',
    actions: [
      'Route shift handover logs and safety permits for multi-party signatures',
      'Verify cryptographic signatures against internal PKI Root Authority',
      'Inspect tamper-evident audit certificate and signer hardware telemetry',
      'Archive signed documents with immutable long-term preservation timestamps',
    ],
    guardrails: [
      'Signatures generate SHA-256 document digests sealed at the time of signing',
      'Any post-signature document modification immediately invalidates the signature seal',
    ],
    technicalSpec: {
      serviceName: 'E-Signature Service',
      port: '4500',
      schema: 'gigalibs_esign',
      primaryStandards: ['FIPS 186-4 Cryptographic Standard', 'eIDAS Compliance'],
    },
  },
  '/runs': {
    category: 'System Telemetry',
    businessTitle: 'Execution Runs & Telemetry',
    summary: 'Real-time telemetry and execution monitoring for all automated workflows, scheduled jobs, and system tasks.',
    actions: [
      'Track real-time workflow execution progress and step latency',
      'Inspect execution payloads, intermediate variables, and error logs',
      'Manually retry failed workflow steps with original context',
      'Cancel or terminate hung or runaway automated processes',
    ],
    guardrails: [
      'Execution logs maintain complete state history for post-incident analysis',
      'Sensitive payload fields are redacted prior to telemetry logging',
    ],
    technicalSpec: {
      serviceName: 'Execution Plane',
      port: '8000',
    },
  },
  '/exceptions': {
    category: 'System Telemetry',
    businessTitle: 'Incident & Dead-Letter Queue',
    summary: 'Quarantine and resolution workbench for failed integrations, malformed payloads, and unrecoverable business exceptions.',
    actions: [
      'Review quarantined message payloads with highlighted schema validation failures',
      'Correct payload attributes inline and replay directly to target service',
      'Configure automated retry policies and exponential backoff schedules',
      'Discard poison messages with mandatory reason documentation',
    ],
    guardrails: [
      'Quarantined messages are preserved in isolated storage until explicitly resolved',
      'Replayed messages carry correlation IDs tracing back to original failure',
    ],
    technicalSpec: {
      serviceName: 'Recovery & DLQ Studio',
      port: '4200',
    },
  },

  // ── Administration & Settings ──
  '/settings': {
    category: 'Administration',
    businessTitle: 'Workspace Settings & Security',
    summary: 'Configure organizational branding, user permissions, multi-factor authentication, and enterprise Single Sign-On.',
    actions: [
      'Manage team members, roles, and fine-grained module access permissions',
      'Configure enterprise SAML 2.0 and OIDC Single Sign-On (SSO)',
      'Set corporate localization standards, time zones, and currency preferences',
      'Inspect security audit logs and active user login sessions',
    ],
    guardrails: [
      'Role changes take effect immediately on next token refresh',
      'Administrative changes require re-authentication with multi-factor credentials',
    ],
    technicalSpec: {
      serviceName: 'Platform Control Plane',
      port: '3333',
    },
  },
  '/platform-admin': {
    category: 'Administration',
    businessTitle: 'Platform Fleet Control Tower',
    summary: 'Multi-tenant fleet management across all customer organizations, subscription tiers, and database isolation boundaries.',
    actions: [
      'Provision new customer tenant workspaces and initialize database schemas',
      'Manage enterprise subscription tiers and enabled module entitlements',
      'Monitor fleet-wide database performance and resource consumption',
      'Execute governed zero-downtime database migrations across all tenants',
    ],
    guardrails: [
      'Platform operator actions are strictly segregated from customer business data',
      'Cross-tenant operations require break-glass authorization with full audit logging',
    ],
    technicalSpec: {
      serviceName: 'Platform Control Plane',
      port: '3333',
    },
  },
};

/**
 * Finds the best matching knowledge entry for a given pathname.
 * Handles exact matches as well as prefix matches.
 */
export function getKnowledgeEntry(pathname: string): ModuleKnowledgeEntry {
  // 1. Direct exact match
  if (MODULE_KNOWLEDGE_REGISTRY[pathname]) {
    return MODULE_KNOWLEDGE_REGISTRY[pathname];
  }

  // 2. Longest prefix match
  const matchingKey = Object.keys(MODULE_KNOWLEDGE_REGISTRY)
    .filter((route) => pathname.startsWith(route))
    .sort((a, b) => b.length - a.length)[0];

  if (matchingKey && MODULE_KNOWLEDGE_REGISTRY[matchingKey]) {
    return MODULE_KNOWLEDGE_REGISTRY[matchingKey];
  }

  // 3. Sensible fallback
  const segments = pathname.split('/').filter(Boolean);
  const rawTitle = segments[segments.length - 1] || 'Dashboard';
  const cleanTitle = rawTitle
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return {
    category: 'Enterprise Platform',
    businessTitle: cleanTitle,
    summary: 'Enterprise operational capability and data governance workbench.',
    actions: [
      'Review operational records and performance metrics',
      'Execute authorized workflow actions and status updates',
      'Export data for compliance and reporting requirements',
    ],
    guardrails: [
      'All actions logged to immutable tenant audit trail',
      'Data isolation enforced at the database layer',
    ],
  };
}
