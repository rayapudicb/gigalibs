export const IMPORTABLE_ENTITY_TYPES = [
  'assets',
  'locations',
  'parts',
  'vendors',
  'customers',
  'workforce_resources',
  'departments',
] as const;

export type ImportableEntityType = (typeof IMPORTABLE_ENTITY_TYPES)[number];

export const ENTITY_LABELS: Record<ImportableEntityType, string> = {
  assets: 'Assets',
  locations: 'Locations',
  parts: 'Parts',
  vendors: 'Vendors',
  customers: 'Customers',
  workforce_resources: 'Workforce',
  departments: 'Departments',
};

export type ImportJobStatus =
  | 'PENDING'
  | 'PARSING'
  | 'VALIDATING'
  | 'AWAITING_REVIEW'
  | 'COMMITTING'
  | 'COMPLETED'
  | 'COMPLETED_WITH_ERRORS'
  | 'FAILED'
  | 'CANCELLED';

export type ExportJobStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface ColumnWarning {
  column: string;
  reason: 'UNRECOGNIZED' | 'FORMULA_STRIPPED' | 'ALIAS_RESOLVED';
  suggestion?: string;
  resolvedTo?: string;
}

export interface ImportOptions {
  allOrNothingThreshold: number;
  historical: boolean;
  columnMappingOverrides: Record<string, string>;
}

export interface ImportJob {
  tenantId: string;
  id: string;
  entityType: ImportableEntityType;
  status: ImportJobStatus;
  totalRows: number | null;
  successRows: number;
  failedRows: number;
  columnWarnings: ColumnWarning[];
  options: ImportOptions;
  s3Key: string | null;
  errorReportS3Key: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  progress?: number;
}

export interface ExportJob {
  tenantId: string;
  id: string;
  entityType: ImportableEntityType;
  status: ExportJobStatus;
  rowCount: number | null;
  s3Key: string | null;
  downloadUrl?: string;
  downloadUrlExpiresAt: string | null;
  exportedBy: string;
  createdAt: string;
  completedAt: string | null;
}

export interface PresignUploadResult {
  jobId: string;
  uploadUrl: string;
  uploadMethod: 'PUT';
  expiresAt: string;
}

export interface InitiateImportResult {
  jobId: string;
  uploadUrl: string;
  uploadMethod: 'PUT';
  expiresAt: string;
}

export interface ExportFilters {
  status?: string;
  locationId?: string;
  categoryId?: string;
  departmentId?: string;
  q?: string;
  dateFrom?: string;
  dateTo?: string;
  columns?: string[];
}

// Wizard step state
export type WizardStep =
  | 'select-entity'
  | 'select-file'
  | 'sheet-select'
  | 'column-mapping'
  | 'review-warnings'
  | 'uploading'
  | 'processing'
  | 'done';

export interface WizardState {
  step: WizardStep;
  entityType: ImportableEntityType | null;
  file: File | null;
  columnMappingOverrides: Record<string, string>;
  historical: boolean;
  jobId: string | null;
  job: ImportJob | null;
  error: string | null;
  /** Sheet names detected in uploaded multi-sheet file */
  availableSheets: string[] | null;
  /** Sheet names the user has selected to import (null = all) */
  selectedSheets: string[] | null;
}
