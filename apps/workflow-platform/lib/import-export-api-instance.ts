/**
 * Shared ImportExportApi instance for the workflow-platform.
 *
 * Uses the existing CMMS BFF proxy at /api/cmms so that all authentication,
 * tenant resolution and module-access checks are handled server-side by the
 * Next.js catch-all route at app/api/cmms/[...path]/route.ts.
 */
import { ImportExportApi } from '@gigalibs/data-import-export-react';

/**
 * The base URL is the CMMS BFF prefix. The ImportExportApi will append
 * "/v1/import-export/..." paths to this base, which matches the proxy's
 * path-rewriting logic (joins segments and prepends /v1/ when absent).
 */
export const importExportApi = new ImportExportApi({
  baseUrl: '/api/cmms',
});
