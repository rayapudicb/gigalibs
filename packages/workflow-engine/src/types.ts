export type ConditionOperator = 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'in';

export interface WorkflowCondition {
  field: string;
  operator: ConditionOperator;
  value: unknown;
}

export interface WorkflowAction {
  type: string; // e.g. 'send_email', 'assign_owner', 'trigger_webhook', 'update_status'
  config: Record<string, unknown>;
}

export interface WorkflowRule {
  id: string;
  name: string;
  triggerEvent: string;
  conditions: WorkflowCondition[];
  actions: WorkflowAction[];
  isActive: boolean;
}

export interface AgentPersona {
  id: string;
  name: string;
  role: string;
  model: string;
  systemPrompt: string;
  tools: string[];
  avatar: string;
  status: 'ACTIVE' | 'IDLE' | 'BUSY';
  totalTasksCompleted: number;
}

export type ConnectorCategory =
  | 'DATA_BI'
  | 'ERP_FINANCE'
  | 'CRM_SALES'
  | 'WORKPLACE_EMAIL'
  | 'PAYMENTS_ESIGN';

export type ConnectorType =
  | 'TABLEAU'
  | 'POWER_BI'
  | 'SNOWFLAKE'
  | 'SAP'
  | 'NETSUITE'
  | 'WORKDAY'
  | 'SALESFORCE'
  | 'HUBSPOT'
  | 'MICROSOFT_365'
  | 'GOOGLE_WORKSPACE'
  | 'SLACK'
  | 'STRIPE'
  | 'DOCUSIGN'
  | 'QUICKBOOKS';

export interface EnterpriseConnector {
  id: string;
  name: string;
  type: ConnectorType;
  category: ConnectorCategory;
  status: 'CONNECTED' | 'DISCONNECTED';
  endpointUrl: string;
  authMethod: 'OAUTH2' | 'API_KEY' | 'MTLS' | 'BEARER_JWT';
  lastSyncAt: string;
  latencyMs: number;
  icon: string;
  description: string;
  samplePayload: Record<string, unknown>;
}

// Connection Health & Heartbeat telemetry
export interface ConnectionHealthStatus {
  connectorId: string;
  connectorName: string;
  type: ConnectorType;
  health: 'HEALTHY' | 'DEGRADED' | 'DOWN';
  uptimePercent: number;
  rttLatencyMs: number;
  lastHeartbeatPing: string;
  sslCertExpiresAt: string;
  oauthTokenStatus: 'VALID' | 'REFRESH_PENDING' | 'EXPIRED';
}

// Backward compatibility alias
export type ErpConnector = EnterpriseConnector;

export interface WorkflowDefinition {
  id: string;
  name: string;
  appTarget: string; // e.g. 'SAP S/4HANA', 'SAP FICO', 'Microsoft 365', 'Tableau'
  category: 'ERP_FINANCE' | 'DATA_BI' | 'WORKPLACE' | 'LOGISTICS_MAPS';
  description: string;
  isActive: boolean;
  triggerType: 'WEBHOOK' | 'CRON' | 'GEOFENCE' | 'EVENT';
  totalRuns: number;
  successRatePercent: number;
  nodes: any[];
  edges: any[];
}

export interface WorkflowRunLog {
  runId: string;
  workflowId: string;
  workflowName: string;
  status: 'SUCCEEDED' | 'FAILED_DLQ' | 'RUNNING';
  durationMs: number;
  credits: number;
  timestamp: string;
  stepsLog: string[];
}

export interface ExecutionTraceStep {
  stepIndex: number;
  nodeName: string;
  module: string;
  durationMs: number;
  status: 'SUCCESS' | 'FAILED';
  outputSummary: string;
}

export interface WorkflowExecutionTrace {
  runId: string;
  workflowName: string;
  triggeredAt: string;
  totalDurationMs: number;
  creditsConsumed: number;
  steps: ExecutionTraceStep[];
}
