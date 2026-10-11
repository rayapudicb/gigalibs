/**
 * Universal Operational Assistant Tool Registry
 * Domain-agnostic tool definitions, semantic intent mapping, and execution dispatch.
 * 
 * Complies with ADR-0016 / WI-OI-121 sovereign zero-external-egress standard.
 */

export interface ToolParameterSchema {
  type: string;
  description?: string;
  enum?: string[];
  properties?: Record<string, ToolParameterSchema>;
  required?: string[];
}

export interface OperationalToolDefinition {
  name: string;
  domain: string;
  description: string;
  semanticKeywords: string[];
  semanticExamples: string[];
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameterSchema>;
    required?: string[];
  };
  uiCardComponent: string;
}

export const GIGALIBS_TOOL_CATALOG: OperationalToolDefinition[] = [
  {
    name: 'cmms_search_assets',
    domain: 'Asset & Facilities Management',
    description: 'Search physical equipment, machinery, devices, hardware, and asset registry in CMMS. Use for any inquiries regarding equipment status, machine locations, tag IDs, chillers, pumps, ventilators, or assets.',
    semanticKeywords: [
      'asset', 'assets', 'equipment', 'machinery', 'machine', 'apparatus',
      'device', 'hardware', 'fridge', 'pump', 'chiller', 'ventilator',
      'turbine', 'motor', 'serial', 'tag', 'register', 'substation'
    ],
    semanticExamples: [
      'What assets do we have on site?',
      'Show me all registered equipment',
      'List machinery currently operational',
      'Asset register details for fridge tag #10101',
      'Where is the secondary feed pump located?'
    ],
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Free-text search or asset tag number' },
        status: { type: 'string', enum: ['OPERATIONAL', 'DEGRADED', 'FAILED', 'ALL'], description: 'Equipment operational state' },
      },
    },
    uiCardComponent: 'SpatialEquipmentCard',
  },
  {
    name: 'cmms_get_daily_inspections',
    domain: 'Floor Operations & Checklists',
    description: 'Retrieve daily operator inspection checklists, floor routine walkthroughs, clinical rounds, or shift verification tasks.',
    semanticKeywords: [
      'inspection', 'checklist', 'routine', 'tasks', 'shift', 'walkthrough',
      'rounds', 'floor check', 'operator check', 'daily tasks', 'pump reading', 'vibration'
    ],
    semanticExamples: [
      'What are my daily inspection tasks today?',
      'Show shift checklist for unit ABC',
      'Floor routine walkthrough for zone 4',
      'Operator inspection form INSP-2026-ABC-09'
    ],
    parameters: {
      type: 'object',
      properties: {
        unitId: { type: 'string', description: 'Plant zone or unit identifier (e.g., UNIT-ABC)' },
        shift: { type: 'string', description: 'Operational shift (e.g., DAY, NIGHT, ROTATING)' },
      },
    },
    uiCardComponent: 'DailyInspectionChecklistCard',
  },
  {
    name: 'analytics_generate_report',
    domain: 'Operational Intelligence & Analytics',
    description: 'Generate operational performance reports, downtime statistics, OEE summaries, energy consumption, or financial logs with export options.',
    semanticKeywords: [
      'report', 'export', 'excel', 'csv', 'downtime', 'oee', 'analytics',
      'summary', 'stats', 'statistics', 'metrics', 'energy', 'consumption', 'pdf'
    ],
    semanticExamples: [
      'Generate a downtime report for all equipment in Excel',
      'Export the last 24 hours energy consumption stats',
      'Download weekly maintenance OEE analytics',
      'Create an equipment utilization report'
    ],
    parameters: {
      type: 'object',
      properties: {
        reportType: {
          type: 'string',
          enum: ['DOWNTIME', 'OEE', 'ENERGY', 'MAINTENANCE_COSTS', 'EQUIPMENT_UTILIZATION'],
          description: 'Type of operational intelligence report',
        },
        format: { type: 'string', enum: ['EXCEL', 'CSV', 'PDF'], description: 'Desired export file format' },
        dateRange: { type: 'string', description: 'Time horizon (e.g., LAST_24H, LAST_7D, LAST_30D)' },
      },
      required: ['reportType'],
    },
    uiCardComponent: 'ReportArtifactCard',
  },
  {
    name: 'platform_get_module_health',
    domain: 'Platform Observability & Diagnostics',
    description: 'Query operational health, microservice latency, database connection status, and circuit breakers across the entire platform.',
    semanticKeywords: [
      'health', 'status', 'uptime', 'latency', 'services', 'system',
      'ping', 'diagnostics', 'circuit', 'offline', 'online', 'unavailable', 'modules'
    ],
    semanticExamples: [
      'What is the health of all platform modules?',
      'Check system diagnostics and latency',
      'Are any backend microservices currently down?',
      'Platform observability matrix'
    ],
    parameters: {
      type: 'object',
      properties: {
        modules: { type: 'string', description: 'Comma-separated module names or ALL' },
      },
    },
    uiCardComponent: 'ModuleHealthMatrixCard',
  },
  {
    name: 'cmms_create_work_order',
    domain: 'Maintenance Execution',
    description: 'Draft or schedule a corrective maintenance work order or equipment repair ticket.',
    semanticKeywords: [
      'work order', 'maintenance', 'repair', 'fix', 'breakdown', 'malfunction',
      'defect', 'corrective', 'ticket', 'schedule repair', 'urgent repair'
    ],
    semanticExamples: [
      'Create an emergency work order for pump FP-101',
      'Draft a maintenance ticket for high bearing vibration',
      'Schedule repair for compressor cooling fan',
      'Issue corrective work order'
    ],
    parameters: {
      type: 'object',
      properties: {
        assetTag: { type: 'string', description: 'Target asset tag number' },
        title: { type: 'string', description: 'Summary of problem' },
        priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], description: 'Work order urgency' },
      },
      required: ['title'],
    },
    uiCardComponent: 'WorkOrderDraftCard',
  },
  {
    name: 'safety_dispatch_emergency_alert',
    domain: 'Safety & Incident Management',
    description: 'Trigger emergency safety broadcast, hazardous incident alert, or STAT notification across communication channels.',
    semanticKeywords: [
      'emergency', 'alert', 'danger', 'incident', 'leak', 'fire', 'spill',
      'stat', 'hazard', 'safety', 'evacuate', 'code blue', 'high pressure'
    ],
    semanticExamples: [
      'Trigger an emergency gas leak alert for Sector 4',
      'Hazardous material spill notification',
      'Broadcast emergency evacuation warning',
      'Critical boiler pressure breach alert'
    ],
    parameters: {
      type: 'object',
      properties: {
        severity: { type: 'string', enum: ['WARNING', 'CRITICAL', 'CATASTROPHIC'] },
        message: { type: 'string', description: 'Alert broadcast text' },
        zone: { type: 'string', description: 'Physical location or ward' },
      },
      required: ['message'],
    },
    uiCardComponent: 'EmergencyAlertCard',
  },
  {
    name: 'spatial_get_digital_twin',
    domain: 'Geospatial & 3D Visualization',
    description: 'Load the interactive 3D spatial digital twin or CAD layout of plant equipment, facility units, or substations.',
    semanticKeywords: [
      '3d', 'spatial', 'digital twin', 'cad', 'twin', 'layout', '3d model',
      'substation 4', 'plant plan', 'visualize equipment'
    ],
    semanticExamples: [
      'Show 3D digital twin of Feed Pump FP-101',
      'Open spatial equipment viewer for Substation 4',
      'Display 3D plant layout',
      'Inspect 3D mesh model of heat exchanger'
    ],
    parameters: {
      type: 'object',
      properties: {
        assetTag: { type: 'string', description: 'Equipment tag or zone' },
      },
    },
    uiCardComponent: 'SpatialEquipmentCard',
  },
  {
    name: 'finance_get_ar_aging',
    domain: 'Financial Accounts Receivable',
    description: 'Retrieve accounts receivable aging summaries, overdue customer balances, and dunning action items.',
    semanticKeywords: [
      'ar aging', 'aging', 'invoice', 'invoices', 'overdue', 'receivable',
      'dunning', 'unpaid', 'billing', 'customer debt', 'aging summary'
    ],
    semanticExamples: [
      'Show current AR aging summary',
      'Which client accounts are 60+ days overdue?',
      'Review pending collections and dunning notices'
    ],
    parameters: {
      type: 'object',
      properties: {
        minDaysOverdue: { type: 'number', description: 'Filter threshold in days (e.g., 30, 60, 90)' },
      },
    },
    uiCardComponent: 'ARAgingSummaryCard',
  },
  {
    name: 'inventory_check_stock',
    domain: 'Inventory & Materials Management',
    description: 'Check stock levels, warehouse storerooms, spare parts counts, and reorder triggers.',
    semanticKeywords: [
      'inventory', 'stock', 'spare parts', 'materials', 'supplies',
      'warehouse', 'storeroom', 'parts count', 'reorder level', 'available parts'
    ],
    semanticExamples: [
      'Do we have mechanical seals in stock?',
      'Check storeroom inventory for replacement gaskets',
      'What spare parts are below reorder threshold?'
    ],
    parameters: {
      type: 'object',
      properties: {
        partQuery: { type: 'string', description: 'Part name, SKU, or description' },
      },
    },
    uiCardComponent: 'InventoryStockCard',
  },
];

/**
 * Tokenize and normalize natural language text for semantic similarity
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

export interface SemanticMatchResult {
  tool: OperationalToolDefinition;
  confidence: number;
  extractedParameters: Record<string, unknown>;
}

/**
 * High-speed, zero-cost semantic intent router.
 * Evaluates semantic token overlap, keyword clustering, and query intent
 * without relying on brittle exact substring matches or external vendor APIs.
 */
export function resolveSemanticIntent(userPrompt: string): SemanticMatchResult | null {
  if (!userPrompt || userPrompt.trim().length === 0) return null;

  const promptTokens = new Set(tokenize(userPrompt));
  const promptLower = userPrompt.toLowerCase();

  let highestScore = 0;
  let bestMatch: OperationalToolDefinition | null = null;

  for (const tool of GIGALIBS_TOOL_CATALOG) {
    let score = 0;

    // 1. Keyword overlap with weight
    for (const kw of tool.semanticKeywords) {
      if (promptTokens.has(kw)) {
        score += 3.0;
      } else if (promptLower.includes(kw)) {
        score += 1.5;
      }
    }

    // 2. Semantic example similarity
    for (const example of tool.semanticExamples) {
      const exampleTokens = tokenize(example);
      let overlap = 0;
      for (const t of exampleTokens) {
        if (promptTokens.has(t)) overlap++;
      }
      const similarity = overlap / Math.max(exampleTokens.length, promptTokens.size);
      score += similarity * 4.0;
    }

    if (score > highestScore) {
      highestScore = score;
      bestMatch = tool;
    }
  }

  // Threshold to avoid false positives (min confidence ~0.25)
  if (!bestMatch || highestScore < 1.8) {
    return null;
  }

  // Extract common parameters dynamically
  const extractedParameters: Record<string, unknown> = {};

  // Extract tag or code if present (e.g., #10101, FP-101, UNIT-ABC)
  const tagMatch = userPrompt.match(/#?([0-9]{4,6}|[A-Za-z]{2,5}-[A-Za-z0-9-]+)/);
  if (tagMatch) {
    extractedParameters.assetTag = tagMatch[1];
    extractedParameters.query = tagMatch[1];
    extractedParameters.unitId = tagMatch[1];
  }

  return {
    tool: bestMatch,
    confidence: Math.min(1.0, highestScore / 10.0),
    extractedParameters,
  };
}
