export interface CmmsTask {
  id: string;
  label: string;
  taskType: 'CHECKLIST' | 'NUMERIC' | 'PASS_FAIL';
  status: 'PENDING' | 'PASSED' | 'FAILED' | 'DONE';
  value?: number;
  minValue?: number;
  maxValue?: number;
  unit?: string;
  notes?: string;
}

export interface CmmsLabor {
  id: string;
  technicianName: string;
  role: string;
  hours: number;
  ratePerHour: number;
  timeCategory: 'REGULAR' | 'OVERTIME' | 'HAZARD';
  loggedAt: string;
}

export interface CmmsPartUsage {
  id: string;
  partId: string;
  partNumber: string;
  partName: string;
  quantity: number;
  unitCost: number;
  binLocation: string;
}

export interface CmmsCost {
  id: string;
  description: string;
  amount: number;
  costCategory: string;
}

export interface CmmsComment {
  id: string;
  authorName: string;
  authorRole: string;
  text: string;
  timestamp: string;
}

export interface CmmsAsset {
  id: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  formSchemaId: string | null;
  specs: Record<string, unknown>;
  status: 'OPERATIONAL' | 'UNDER_MAINTENANCE' | 'OFFLINE' | 'DECOMMISSIONED';
  assetTag: string | null;
  serialNumber: string | null;
  model: string | null;
  manufacturer: string | null;
  power: string | null;
  area: string | null;
  acquisitionCost: number | null;
  currencyCode: string;
  locationId: string | null;
  parentAssetId: string | null;
  assignedTo: string | null;
  assignedTeams: string[];
  warrantyExpiry: string | null;
  purchaseDate: string | null;
  criticality: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  iotDeviceId: string | null;
  scadaEndpoint: string | null;
  version: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  // Enterprise fields
  hierarchyLevel?: 'SITE' | 'BUILDING' | 'LINE' | 'MACHINE' | 'ASSEMBLY' | 'COMPONENT';
  healthScore?: number;
  mtbfHours?: number;
  mttrHours?: number;
  ravCost?: number;
  bomParts?: Array<{ partId: string; partNumber: string; name: string; requiredQty: number; onHand: number }>;
  downtimeHistory?: Array<{ id: string; startedAt: string; endedAt: string; durationHours: number; reason: string; category: 'MECHANICAL' | 'ELECTRICAL' | 'HYDRAULIC' | 'OPERATOR' }>;
  documents?: Array<{ name: string; type: 'MANUAL' | 'P&ID' | 'ELECTRICAL' | 'CERT'; url: string; size: string }>;
}

export interface CmmsWorkOrder {
  id: string;
  woNumber: string;
  type: 'REACTIVE' | 'PREVENTIVE' | 'INSPECTION' | 'EMERGENCY';
  priority: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'EMERGENCY';
  status: 'OPEN' | 'IN_PROGRESS' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';
  title: string;
  description: string | null;
  assetId: string | null;
  locationId: string | null;
  categoryId: string | null;
  assignedTo: string | null;
  dueDate: string | null;
  startedAt: string | null;
  completedAt: string | null;
  requiredSignature: boolean;
  signatureData: string | null;
  feedback: string | null;
  triggerSource: string;
  estimatedDuration: number | null;
  auditReceipt: string | null;
  version: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  // Enterprise Execution Suite
  tasks?: CmmsTask[];
  labors?: CmmsLabor[];
  partsUsed?: CmmsPartUsage[];
  additionalCosts?: CmmsCost[];
  comments?: CmmsComment[];
}

export interface CmmsMeter {
  id: string;
  assetId: string;
  name: string;
  unit: string;
  readingType: string;
  currentValue: number | null;
  minThreshold: number | null;
  maxThreshold: number | null;
  iotTopic: string | null;
  lastReadAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CmmsMeterReading {
  id: string;
  meterId: string;
  assetId: string;
  value: number;
  source: string;
  notes: string | null;
  enteredBy: string | null;
  ingestedAt: string;
}

export interface CmmsPart {
  id: string;
  partNumber: string;
  name: string;
  description: string | null;
  category: string | null;
  unitOfMeasure: string;
  unitCost: number | null;
  currencyCode: string;
  quantityOnHand: number;
  minQuantity: number;
  maxQuantity: number | null;
  reorderPoint: number | null;
  nonStock: boolean;
  barcode: string | null;
  area: string | null;
  locationId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  // Enterprise Bin & Supply Tracking
  warehouse?: string;
  aisle?: string;
  rack?: string;
  bin?: string;
  leadTimeDays?: number;
  preferredVendor?: string;
}

export interface CmmsPmSchedule {
  id: string;
  name: string;
  description: string | null;
  assetId: string;
  locationId: string | null;
  categoryId: string | null;
  triggerType: 'CALENDAR' | 'METER_THRESHOLD' | 'BOTH';
  cronExpression: string | null;
  cronTimezone: string;
  meterId: string | null;
  meterThreshold: number | null;
  woTitleTemplate: string | null;
  woDescription: string | null;
  woPriority: string;
  assignedTo: string | null;
  assignedTeams: string[];
  isActive: boolean;
  lastTriggeredAt: string | null;
  nextDueAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CmmsMetrics {
  completedCount: number;
  openCount: number;
  inProgressCount: number;
  onHoldCount: number;
  activeEmergencies: number;
  overdueCount: number;
  avgCycleTimeHours: number;
}

export interface CmmsInventoryMetrics {
  totalParts: number;
  lowStockCount: number;
  totalInventoryValuation: number;
}

export interface CmmsReliabilityMetrics {
  overallMtbfHours: number;
  overallMttrHours: number;
  overallAvailabilityPercent: number;
  ravRatioPercent: number;
  mtbfTrend: Array<{ month: string; mtbfHours: number; targetHours: number }>;
  paretoFailureModes: Array<{ mode: string; count: number; cumulativePercent: number; costImpact: number }>;
  technicianUtilization: Array<{ name: string; activeWos: number; completedWos: number; utilizationPercent: number }>;
}

export async function requestCmms<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `/api/cmms${path.startsWith('/') ? path : `/${path}`}`;
  const headers = new Headers(options.headers || {});
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  const response = await fetch(url, {
    ...options,
    headers,
    cache: 'no-store',
  });

  if (!response.ok) {
    let errorDetail = response.statusText;
    try {
      const body = await response.json();
      errorDetail = body.detail || body.message || JSON.stringify(body);
    } catch {
      // Keep statusText
    }
    const cleanDetail = errorDetail.toLowerCase().includes('upstream service is unavailable')
      ? 'Service is temporarily synchronizing. Please try again shortly.'
      : errorDetail;
    throw new Error(`CMMS API error (${response.status}): ${cleanDetail}`);
  }

  return (await response.json()) as T;
}
