export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface WorkflowGraphNode {
  id: string;
  type: string;
  position?: { x: number; y: number };
  data?: Record<string, JsonValue>;
  config?: Record<string, JsonValue>;
}

export interface WorkflowGraphEdge {
  id?: string;
  source: string;
  target: string;
}

export interface WorkflowGraph {
  nodes: WorkflowGraphNode[];
  edges: WorkflowGraphEdge[];
}

export interface WorkflowVersionSummary {
  id: string;
  version: number;
  checksum: string;
  publishedAt: string;
  schemaVersion?: string;
  compilerVersion?: string;
}

export interface WorkflowPipeline {
  id: string;
  name: string;
  description: string | null;
  targetApp: string;
  definition: WorkflowGraph;
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  activeVersion: number | null;
  totalRuns: number;
  successRate: number;
  createdAt: string;
  updatedAt: string;
  versions: WorkflowVersionSummary[];
}

export type RunStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'action_required';

export interface RunSummary {
  id: string;
  workflow_id: string;
  workflow_version: number;
  status: RunStatus;
  trigger_type: string;
  correlation_id: string;
  queued_at: string;
  started_at: string | null;
  completed_at: string | null;
  error_class: string | null;
  error_summary: string | null;
}

export interface StepSummary {
  id: string;
  node_id: string;
  node_type: string;
  attempt: number;
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped' | 'dlq';
  input_hash: string;
  output_hash: string | null;
  error_class: string | null;
  error_detail: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
}

export interface RunDetail extends RunSummary {
  workflow_checksum: string;
  workflow_schema_version: string;
  workflow_compiler_version: string;
  cancellation_requested: boolean;
  steps: StepSummary[];
}

export interface RunList {
  items: RunSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface TenantEnvironment {
  id: string;
  slug: string;
  displayName: string;
  kind: 'DEVELOPMENT' | 'TEST' | 'STAGING' | 'PRODUCTION' | 'DEMO';
  status: 'ACTIVE' | 'LOCKED' | 'EXPIRED';
  region: string;
  retentionDays: number;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { connections: number; dataContracts: number; sourceEvents: number };
}

export interface CredentialReferenceSummary {
  id: string;
  environmentId: string;
  label: string;
  provider: 'DEPLOYMENT_SECRET' | 'EXTERNAL_VAULT';
  authType:
    | 'NONE'
    | 'BEARER_TOKEN'
    | 'API_KEY_HEADER'
    | 'HMAC_SHA256'
    | 'USERNAME_PASSWORD';
  headerName: string | null;
  status: 'ACTIVE' | 'INVALID' | 'REVOKED';
  referenceConfigured: true;
}

export interface SourceSchemaVersion {
  id: string;
  version: number;
  checksum: string;
  schema: Record<string, JsonValue>;
  maskedSample: JsonValue;
  classification: Record<string, JsonValue>;
  compatibility: Record<string, JsonValue>;
  breakingChange: boolean;
  observedAt: string;
}

export interface ConnectorAttempt {
  id: string;
  operation: 'TEST' | 'PROFILE' | 'INGEST';
  status: 'SUCCEEDED' | 'FAILED' | 'BLOCKED';
  traceId: string;
  responseCode: number | null;
  latencyMs: number | null;
  bytesReceived: number | null;
  errorCode: string | null;
  startedAt: string;
  completedAt: string | null;
}

export interface SourceConnection {
  id: string;
  environmentId: string;
  slug: string;
  name: string;
  interfaceType: 'REST' | 'CSV_HTTP' | 'WEBHOOK' | 'POSTGRESQL' | 'FILE_UPLOAD';
  mode: 'READ_ONLY' | 'READ_WRITE';
  endpoint: string;
  configuration: Record<string, JsonValue>;
  status: 'UNTESTED' | 'READY' | 'READY_WITH_LIMITS' | 'NOT_READY' | 'DISABLED';
  statusReasonCode: string | null;
  lastTestedAt: string | null;
  lastSuccessfulAt: string | null;
  lastLatencyMs: number | null;
  observedSchemaVersion: number | null;
  circuitOpenUntil: string | null;
  createdAt: string;
  updatedAt: string;
  environment?: Pick<TenantEnvironment, 'id' | 'slug' | 'displayName' | 'kind' | 'status'>;
  credentialReference?: Pick<
    CredentialReferenceSummary,
    'id' | 'label' | 'provider' | 'authType' | 'status'
  > | null;
  schemaVersions?: SourceSchemaVersion[];
  attempts?: ConnectorAttempt[];
  _count?: { schemaVersions: number; dataContracts: number; sourceEvents: number };
}

export interface SourceFileImport {
  id: string;
  originalName: string;
  contentType: 'application/json' | 'text/csv';
  declaredByteSize: number;
  actualByteSize: number | null;
  checksumSha256: string;
  classification: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED' | null;
  status: 'UPLOAD_PENDING' | 'AVAILABLE' | 'PROFILED' | 'INGESTED' | 'FAILED' | 'EXPIRED';
  failureCode: string | null;
  sourceEventId: string | null;
  uploadExpiresAt: string;
  completedAt: string | null;
  storageDeletedAt: string | null;
  createdAt: string;
}

export interface DataContractVersion {
  id: string;
  version: number;
  jsonSchema: Record<string, JsonValue>;
  mapping: Record<string, JsonValue>;
  checksum: string;
  compatibilityReport: Record<string, JsonValue>;
  publishedAt: string;
}

export interface DataContract {
  id: string;
  environmentId: string;
  connectionId: string;
  name: string;
  eventType: string;
  status: 'DRAFT' | 'ACTIVE' | 'RETIRED';
  currentVersion: number | null;
  createdAt: string;
  updatedAt: string;
  connection?: Pick<SourceConnection, 'id' | 'name' | 'slug' | 'status'>;
  versions: DataContractVersion[];
}

export type ApDocumentStatus =
  | 'RECEIVED'
  | 'MATCHING'
  | 'MATCHED'
  | 'EXCEPTION'
  | 'PENDING_APPROVAL'
  | 'APPROVED_FOR_PAYMENT'
  | 'REJECTED';

export type BusinessActionStatus =
  | 'PROPOSED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXECUTING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'RECONCILIATION_REQUIRED';

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface SupplierInvoiceSummary {
  id: string;
  externalId: string;
  invoiceNumber: string;
  totalMinor: string;
  currency: string;
  status: ApDocumentStatus;
  invoiceDate: string;
  dueDate: string | null;
  createdAt: string;
  sourceEvent: {
    eventId: string;
    eventType: string;
    eventVersion: number;
    classification: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';
  };
  supplier: { externalId: string; name: string };
  purchaseOrder: { externalId: string } | null;
  matchEvaluations: Array<{
    id: string;
    outcome: 'MATCHED' | 'MISMATCH' | 'INCOMPLETE';
    explanation: string;
    evaluatedAt: string;
  }>;
  actions: Array<{
    id: string;
    actionType: string;
    status: BusinessActionStatus;
    risk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  }>;
}

export interface MatchFindingSummary {
  id: string;
  code: string;
  severity: 'INFO' | 'WARNING' | 'BLOCKING';
  field: string;
  expected: string | null;
  actual: string | null;
  delta: string | null;
  explanation: string;
  incomplete?: boolean;
}

export interface SupplierInvoiceDetail extends SupplierInvoiceSummary {
  subtotalMinor: string;
  taxMinor: string;
  lines: Array<{
    id: string;
    lineNumber: number;
    purchaseOrderLineNumber: number | null;
    description: string;
    quantity: string;
    unitPriceMinor: string;
    totalMinor: string;
  }>;
  purchaseOrder: {
    id: string;
    externalId: string;
    currency: string;
    lines?: Array<{
      id: string;
      lineNumber: number;
      description: string;
      quantity: string;
      unitPriceMinor: string;
      receiptLines?: Array<{
        id: string;
        quantityReceived: string;
      }>;
    }>;
  } | null;
  matchEvaluations: Array<{
    id: string;
    outcome: 'MATCHED' | 'MISMATCH' | 'INCOMPLETE';
    explanation: string;
    evaluatedAt: string;
    ruleVersion?: { id: string; version: number; checksum: string };
    findings?: MatchFindingSummary[];
  }>;
}

export interface BusinessActionSummary {
  id: string;
  actionType: string;
  status: BusinessActionStatus;
  risk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  requiredApprovals: number;
  preview: Record<string, JsonValue>;
  createdAt: string;
  supplierInvoice: {
    id: string;
    invoiceNumber: string;
    totalMinor: string;
    currency: string;
    status: ApDocumentStatus;
    supplier: { name: string; externalId: string };
  };
  approvals: Array<{ approverId: string; decision: 'APPROVED' | 'REJECTED'; decidedAt: string }>;
  result: { status: BusinessActionStatus; executedAt: string } | null;
}

export type OperationalExceptionStatus =
  | 'OPEN'
  | 'ASSIGNED'
  | 'RETRY_SCHEDULED'
  | 'RESOLVED'
  | 'RECONCILIATION_REQUIRED';

export interface OperationalExceptionSummary {
  id: string;
  kind:
    | 'PROCESSING_FAILURE'
    | 'BUSINESS_MISMATCH'
    | 'MISSING_EVIDENCE'
    | 'ACTION_FAILURE'
    | 'RECONCILIATION';
  status: OperationalExceptionStatus;
  severity: 'INFO' | 'WARNING' | 'BLOCKING';
  title: string;
  summary: string;
  rootCauseCode: string;
  retryable: boolean;
  assignedToId: string | null;
  businessImpact: Record<string, JsonValue>;
  openedAt: string;
  environment: { slug: string; displayName: string };
  sourceEvent: {
    eventId: string;
    eventType: string;
    eventVersion: number;
    classification: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';
    status: string;
    rejectionCode: string | null;
  } | null;
  supplierInvoice: {
    invoiceNumber: string;
    totalMinor: string;
    currency: string;
    status: ApDocumentStatus;
  } | null;
  businessAction: { actionType: string; status: BusinessActionStatus } | null;
  _count: { recoveries: number };
}

export interface ValueDefinitionSummary {
  id: string;
  outcomeKey: string;
  name: string;
  description: string | null;
  currency: string;
  classification: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';
  status: 'DRAFT' | 'ACTIVE' | 'RETIRED';
  currentVersion: number | null;
  createdAt: string;
  environment: { slug: string; displayName: string };
  versions: Array<{
    id: string;
    version: number;
    formulaKind: string;
    checksum: string;
    publishedAt: string;
  }>;
}

export interface ValueEventSummary {
  id: string;
  eventType: string;
  currency: string;
  classification: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';
  grossValueMinor: string;
  allocatedCostMinor: string;
  netValueMinor: string;
  status: 'CALCULATED' | 'VERIFIED' | 'REJECTED';
  occurredAt: string;
  valueDefinitionVersion: {
    version: number;
    checksum: string;
    valueDefinition: { id: string; outcomeKey: string; name: string };
  };
  businessAction: { id: string; actionType: string; status: BusinessActionStatus } | null;
  approvals: Array<{ approverId: string; decision: 'VERIFIED' | 'REJECTED'; decidedAt: string }>;
}

export interface ValueReport {
  scope: { environmentId: string | null; occurredFrom: string | null; occurredTo: string | null };
  basis: { verified: string; calculated: string; rejected: string };
  rows: Array<{
    status: 'CALCULATED' | 'VERIFIED' | 'REJECTED';
    currency: string;
    eventCount: number;
    grossValueMinor: string;
    allocatedCostMinor: string;
    netValueMinor: string;
    definition: {
      id: string;
      outcomeKey: string;
      name: string;
      version: number;
      formulaKind: string;
      checksum: string;
    } | null;
  }>;
}
