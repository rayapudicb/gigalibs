export interface ColumnMapping {
  sourceColumn: string;
  targetField: string;
  required?: boolean;
  defaultValue?: unknown;
}

export interface ImportPreviewResult {
  headers: string[];
  totalRows: number;
  sampleRows: Record<string, string>[];
}

export interface ImportProcessingResult<T> {
  successRows: T[];
  failedRows: Array<{ rowNumber: number; data: Record<string, string>; error: string }>;
}
