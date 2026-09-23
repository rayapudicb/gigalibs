import type {
  ImportableEntityType,
  ImportJob,
  ExportJob,
  InitiateImportResult,
  ExportFilters,
} from '../types.js';

export interface ImportExportApiConfig {
  /** Base URL for the CMMS API, e.g. /api/cmms */
  baseUrl: string;
  /** Optional request interceptor for auth headers */
  getHeaders?: () => Record<string, string> | Promise<Record<string, string>>;
}

export class ImportExportApi {
  private readonly baseUrl: string;
  private readonly getHeaders: () => Record<string, string> | Promise<Record<string, string>>;

  constructor(config: ImportExportApiConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.getHeaders = config.getHeaders ?? (() => ({}));
  }

  // ─── Import ────────────────────────────────────────────────────────────────

  async initiateImport(
    entityType: ImportableEntityType,
    filename: string,
    options: { historical?: boolean; columnMappingOverrides?: Record<string, string>; multiSheet?: boolean } = {},
  ): Promise<InitiateImportResult> {
    const res = await this.request<{ data: InitiateImportResult }>('POST', '/v1/import-export/imports', {
      entityType,
      filename,
      ...options,
    });
    return res.data;
  }

  async uploadFile(uploadUrl: string, file: File, onProgress?: (pct: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', uploadUrl);
      xhr.setRequestHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      if (onProgress) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
        };
      }
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`)));
      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.send(file);
    });
  }

  async enqueueImport(jobId: string, options?: { selectedSheets?: string[] | null }): Promise<void> {
    const body = options?.selectedSheets != null ? { selectedSheets: options.selectedSheets } : undefined;
    await this.request('POST', `/v1/import-export/imports/${jobId}/enqueue`, body);
  }

  async getImportJob(jobId: string): Promise<ImportJob> {
    const res = await this.request<{ data: ImportJob }>('GET', `/v1/import-export/imports/${jobId}`);
    return res.data;
  }

  async listImportJobs(entityType?: ImportableEntityType, limit = 25): Promise<ImportJob[]> {
    const qs = new URLSearchParams();
    if (entityType) qs.set('entityType', entityType);
    qs.set('limit', String(limit));
    const res = await this.request<{ data: ImportJob[] }>('GET', `/v1/import-export/imports?${qs}`);
    return res.data;
  }

  async cancelImportJob(jobId: string): Promise<void> {
    await this.request('DELETE', `/v1/import-export/imports/${jobId}`);
  }

  async listSheets(jobId: string): Promise<string[]> {
    const res = await this.request<{ data: { sheetNames: string[] } }>(
      'GET',
      `/v1/import-export/imports/${jobId}/sheets`,
    );
    return res.data.sheetNames;
  }

  async getErrorReportUrl(jobId: string): Promise<string> {
    const res = await this.request<{ data: { downloadUrl: string } }>('GET', `/v1/import-export/presign/${jobId}/error-report`);
    return res.data.downloadUrl;
  }

  async downloadTemplate(entityType: ImportableEntityType): Promise<Blob> {
    const headers = await this.getHeaders();
    const response = await fetch(`${this.baseUrl}/v1/import-export/templates/${entityType}`, { headers });
    if (!response.ok) throw new Error(`Template download failed: ${response.status}`);
    return response.blob();
  }

  // ─── Export ────────────────────────────────────────────────────────────────

  async initiateExport(entityType: ImportableEntityType, filters: ExportFilters = {}): Promise<{ jobId: string }> {
    const res = await this.request<{ data: { jobId: string } }>('POST', '/v1/import-export/exports', {
      entityType,
      filters,
    });
    return res.data;
  }

  async getExportJob(jobId: string): Promise<ExportJob> {
    const res = await this.request<{ data: ExportJob }>('GET', `/v1/import-export/exports/${jobId}`);
    return res.data;
  }

  async listExportJobs(entityType?: ImportableEntityType, limit = 25): Promise<ExportJob[]> {
    const qs = new URLSearchParams();
    if (entityType) qs.set('entityType', entityType);
    qs.set('limit', String(limit));
    const res = await this.request<{ data: ExportJob[] }>('GET', `/v1/import-export/exports?${qs}`);
    return res.data;
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const extraHeaders = await this.getHeaders();
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...extraHeaders,
    };
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const response = await fetch(`${this.baseUrl}${path}`, init);
    if (!response.ok) {
      let detail = response.statusText;
      try {
        const err = (await response.json()) as Record<string, unknown>;
        detail = (err['message'] as string) ?? (err['detail'] as string) ?? detail;
      } catch { /* keep statusText */ }
      throw new Error(`[${response.status}] ${detail}`);
    }
    // Some endpoints return raw binary
    const ct = response.headers.get('content-type') ?? '';
    if (ct.includes('application/json')) return response.json() as Promise<T>;
    return {} as T;
  }
}
