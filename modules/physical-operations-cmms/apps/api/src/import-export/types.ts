// WI-OI-043 — Import/Export core type definitions
// All import/export state machine types, job shapes, and row contracts.

// ─── Entity types ─────────────────────────────────────────────────────────────

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

// ─── Import job ───────────────────────────────────────────────────────────────

export const IMPORT_JOB_STATUSES = [
  'PENDING',
  'PARSING',
  'VALIDATING',
  'AWAITING_REVIEW',
  'COMMITTING',
  'COMPLETED',
  'COMPLETED_WITH_ERRORS',
  'FAILED',
  'CANCELLED',
] as const;

export type ImportJobStatus = (typeof IMPORT_JOB_STATUSES)[number];

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
  /** Percentage 0–100, present during active processing */
  progress?: number;
}

export interface ImportJobRow {
  tenantId: string;
  id: string;
  jobId: string;
  rowNumber: number;
  externalId: string | null;
  status: 'PENDING' | 'VALID' | 'FAILED' | 'COMMITTED';
  errorDetail: RowErrorDetail | null;
}

export interface RowErrorDetail {
  code: string;
  message: string;
  field?: string;
  value?: unknown;
}

export interface ColumnWarning {
  column: string;
  reason: 'UNRECOGNIZED' | 'FORMULA_STRIPPED' | 'ALIAS_RESOLVED';
  suggestion?: string;
  resolvedTo?: string;
}

export interface ImportOptions {
  /** Threshold: files ≤ this use all-or-nothing mode */
  allOrNothingThreshold: number;
  /** Whether this is a historical migration (bypasses state machine for WOs) */
  historical: boolean;
  /** Caller-provided column mappings from the wizard's mapping step */
  columnMappingOverrides: Record<string, string>;
  /**
   * When true the uploaded file is a multi-sheet workbook.
   * Each worksheet is processed independently as a department sub-batch.
   * Only applies to workforce_resources.
   */
  multiSheet?: boolean;
  /**
   * Subset of sheet names to import (if omitted, all sheets are imported).
   * Only relevant when multiSheet is true.
   */
  selectedSheets?: string[];
}

// ─── Export job ───────────────────────────────────────────────────────────────

export const EXPORT_JOB_STATUSES = ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED'] as const;
export type ExportJobStatus = (typeof EXPORT_JOB_STATUSES)[number];

export interface ExportJob {
  tenantId: string;
  id: string;
  entityType: ImportableEntityType;
  status: ExportJobStatus;
  filters: ExportFilters;
  rowCount: number | null;
  s3Key: string | null;
  downloadUrlExpiresAt: string | null;
  downloadUrl?: string;
  exportedBy: string;
  createdAt: string;
  completedAt: string | null;
}

export interface ExportFilters {
  status?: string;
  locationId?: string;
  categoryId?: string;
  departmentId?: string;
  q?: string;
  dateFrom?: string;
  dateTo?: string;
  /** Restrict to columns the principal is allowed to see */
  columns?: string[];
  /** If set, only rows scoped to these departments */
  departmentScope?: string[];
  /**
   * When true, workforce_resources export groups rows by department,
   * producing one Excel sheet per department.
   */
  multiSheet?: boolean;
}

// ─── Column registry ──────────────────────────────────────────────────────────

export type ColumnKind =
  | 'db-direct'         // column maps 1:1 to a DB column
  | 'fk-resolve'        // resolved from a name/code to an ID FK
  | 'hierarchy'         // self-referencing FK (parent); requires topological sort
  | 'computed'          // derived server-side; export-only
  | 'array-fk'         // resolved to uuid[] (e.g. assigned_vendors)
  | 'spec-jsonb'        // goes into the `specs` JSONB column
  | 'custom-jsonb';     // goes into `custom_attributes` JSONB column

export interface EntityColumnDef {
  /** Column header label in template / upload file */
  key: string;
  /** Maps to DB column when kind = 'db-direct' | 'fk-resolve' (after resolution) */
  dbColumn?: string;
  kind: ColumnKind;
  required: boolean;
  /** Human-readable description shown in template column header tooltip */
  description: string;
  /** If the column is a FK, describes how to pre-resolve it */
  fkResolution?: {
    /** Table in gigalibs_cmms schema */
    table: string;
    /** Column used to match the incoming value */
    matchColumn: 'name' | 'code' | 'asset_tag' | 'email';
    /** DB column to write after resolution */
    resolvedDbColumn: string;
    /** Whether the FK is optional (null allowed when blank) */
    nullable: boolean;
  };
  /** Only for kind=hierarchy: the column this references in the same entity */
  hierarchyParentMatchColumn?: 'name' | 'asset_tag' | 'code';
  /** Allowed string values (drives ExcelJS dropdown validation) */
  enumValues?: string[];
  /** Column is present in download template but not upload template */
  exportOnly?: boolean;
  /** Permissions required to see this column in export */
  exportRoles?: string[];
  /** Approximate column width for template (characters) */
  templateWidth?: number;
  /** If true, formula injection detection is applied */
  detectFormulas?: boolean;
}

// ─── BullMQ job payloads ──────────────────────────────────────────────────────

export interface ImportJobPayload {
  tenantId: string;
  actorId: string;
  jobId: string;
  entityType: ImportableEntityType;
  s3Key: string;
  options: ImportOptions;
}

export interface ExportJobPayload {
  tenantId: string;
  actorId: string;
  jobId: string;
  entityType: ImportableEntityType;
  filters: ExportFilters;
  /** Columns the actor is authorized to see */
  allowedColumns: string[];
  departmentScope: string[] | null;
}

// ─── FK resolution ────────────────────────────────────────────────────────────

/** Fully pre-resolved FK map: external value → uuid */
export type FkMap = Map<string, string>;

/** One FK column's resolved maps, keyed by column key */
export type FkResolutionResult = Record<string, FkMap>;

// ─── Batch write ──────────────────────────────────────────────────────────────

export interface ValidatedRow {
  rowNumber: number;
  externalId: string | null;
  dbValues: Record<string, unknown>;
  specValues: Record<string, unknown>;
  customValues: Record<string, unknown>;
  warnings: ColumnWarning[];
}

export interface BatchResult {
  committed: number;
  failed: Array<{ rowNumber: number; error: string }>;
}

// ─── Presign ──────────────────────────────────────────────────────────────────

export interface PresignUploadResult {
  jobId: string;
  uploadUrl: string;
  uploadMethod: 'PUT';
  expiresAt: string;
}
