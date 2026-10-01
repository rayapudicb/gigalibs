# WI-OI-106: Reports v2, PDF and Excel (ADR-0016 F17)

- **Status:** Review (completion slice: automated implementation, user-bound renewable download grants, expired-grant cleanup, throwaway database proof, unit/integration/API tests, and fail-closed browser test script complete; pending owner approval for live migration 000026 deployment and live browser proof execution).
- **Owner:** Analytics Studio / Web Experience.
- **Decision records:** ADR-0016 F17, owner decisions D1–D5 in task card `.pi/tasks/WI-OI-106.md`.
- **Task card:** `.pi/tasks/WI-OI-106.md`.
- **Independent reviewers:** Web/Accessibility, Security & Privacy, QA/SDET.

## G0: why

In Reports v1 (WI-OI-103e), reports produced CSV only. Stakeholders and scheduled consumers require rich visual artifacts (vector PDF matching screen presentation, and typed Excel workbooks with separate sheets per visualization and metadata). ADR-0016 F17 mandates server-side chart rendering with formula-injection protection, spatial scope preservation, and backwards compatibility with existing CSV delivery.

## G2: acceptance

1. **Format selection:** Report definitions support any combination of `['CSV', 'XLSX', 'PDF']` (defaults to `['CSV']`), updatable via `PATCH /v1/reports/definitions/:id/formats`.
2. **Backward compatibility:** Existing CSV output is preserved byte-for-byte with existing formula prefixing (`=+\-@\t\r`). The legacy `download` token object in `ReportRunV1` continues to return CSV for all existing clients.
3. **Excel generation:** Generates native XLSX with typed numeric cells, ISO-8601 formatted date cells (`yyyy-mm-dd hh:mm:ss`), frozen header row (`ySplit: 1`), auto-filters, bold header row, sheet per chart section, an "About" metadata sheet (report metadata, freshness, filters, watermark, row counts), and formula-injection neutralization (`csvSafeText`).
4. **PDF generation:** Server-side ECharts vector SVG rendering without headless Chrome or native binary dependencies (`svg-to-pdfkit`), embedded into vector PDFKit document. Includes header with timestamp/freshness/watermark, vector charts, visual paginated data tables with headers, page numbers, truncation notes when rows exceed limit, and spatial scoping (scoped members see only their allowed places). *Note on accessibility:* The PDF output provides visual paginated tables and vector charts for viewing/printing; it does not produce tagged PDF (PDF/UA) structure elements.
5. **Atomic artifact persistence:** All requested format files are generated in-memory before persistence. If any format fails, zero artifacts are saved to `report_artifacts` and the run fails atomically.
6. **Safe token renewal & user binding:** Separate `report_download_grants` table stores hashed tokens (SHA-256) bound to the requesting user (`user_id = principal.subject`). Renewing a token deletes expired grants within the tenant transaction and issues a fresh 15-minute grant. Another user in the same tenant cannot download using that token (returns 404). Expired tokens return 410 with clear renewal instructions.
7. **Durable run history:** `GET /v1/reports/definitions/:id/runs` displays the latest 50 runs with status, timestamps, row count, errors, and downloadable files. File metadata is preserved even after download tokens expire.
8. **Web workbench:** Accessible format selection checkboxes (`role="group" aria-label="Report formats"`), format badges per report, format editing modal (`PATCH`), durable run history drawer with 50 runs, download token renewal on click, visible focus styling, and live status announcement (`role="status" aria-live="polite"`).

## What changed

### 106a: Contracts and migration 000026 (D1, D4)

- `packages/contracts/src/analytics/report.ts`:
  - Added `ReportFormatV1` enum (`'CSV' | 'XLSX' | 'PDF'`).
  - Added `formats` field to `CreateReportV1Schema` and `ReportV1Schema`.
  - Added `UpdateReportFormatsV1Schema` for `PATCH /v1/reports/definitions/:id/formats`.
  - Added `ReportFileV1Schema` (token and expiresAt nullable/optional for metadata retention after expiry) and `ReportDownloadTokenV1Schema`.
  - Updated `ReportRunV1Schema` with ordered `files: ReportFileV1[]`, while preserving legacy `download` field pointing to CSV.
- `modules/analytics-studio/db/migrations/000026_report_formats.up.sql`:
  - Adds `formats text[] NOT NULL DEFAULT ARRAY['CSV']` to `report_definitions`.
  - Adds `format text NOT NULL DEFAULT 'CSV'` to `report_artifacts`.
  - Enforces `UNIQUE (run_id, format)` on `report_artifacts`.
  - Creates `report_download_grants` table with tenant isolation RLS, cascade FK to artifacts, token hash uniqueness, and user ID binding.
  - Creates index `idx_report_download_grants_lookup (token_hash, expires_at)` and `idx_report_download_grants_expiry (tenant_id, expires_at)`.
  - Inserts version 26 into `schema_migrations`.

### 106b: Shared chart builder package (D3)

- `packages/analytics-charts`:
  - Pure zero-runtime-browser chart builder package providing `toEChartsOption`, `placeMap`, `REPORT_THEME`, `formatCell`, and `isEChartsType`.
  - Re-exported by `apps/workflow-platform/lib/analytics/chart-render.ts` to guarantee exact visual parity between browser UI and server PDF.
  - Added to `config/package-layers.json` under `analytics`.

### 106c: Server-side file generation engines (D1, D4, D5)

- `modules/analytics-studio/apps/api/src/reports/report-files.ts`:
  - `buildXlsx`: `exceljs` workbook builder with typed cells, dates, auto-filters, frozen header, sanitized text cells, section sheets, and comprehensive "About" sheet.
  - `chartSvg`: Server-side SVG rendering via ECharts SVG renderer with isolated crypto map IDs.
  - `pdfText`: WinAnsi charset sanitization with fallback and replacement counting.
  - `buildPdf`: Vector PDFKit layout embedding ECharts SVG via `svg-to-pdfkit`, visual paginated data tables, and spatial scope filtering.

### 106d: Service, Controller, and BFF integration

- `modules/analytics-studio/apps/api/src/reports/report.service.ts`:
  - Integrated `buildXlsx` and `buildPdf`.
  - All-or-nothing execution: generates all format buffers before executing a single atomic tenant transaction inserting `report_artifacts`.
  - Added `generateDownloadToken`: wrapped in `withTenantTransaction`, cleans expired grants for the tenant, binds new grant to `principal.subject`, and stores SHA-256 hash.
  - Updated `downloadArtifact`: queries `report_download_grants` with `g.token_hash = $1 AND g.user_id = $2`, enforces spatial scope, returns clear 410 on expiration, and falls back to legacy artifact tokens for backwards compatibility.
  - Added `listReportRuns`: lists latest 50 runs with preserved file metadata.
  - Updated `createReportDefinition` and `updateReportFormats` with tenant audit logging.
- `modules/analytics-studio/apps/api/src/reports/report.controller.ts`:
  - Added `@Patch('definitions/:definitionId/formats')` guarded by `@RequirePermissions('analytics:reports:write')`.
  - Added `@Get('definitions/:definitionId/runs')` guarded by `@RequirePermissions('analytics:reports:read')`.
  - Added `@Post('runs/:runId/files/:format/download-token')` guarded by `@RequirePermissions('analytics:export')`.
- `apps/workflow-platform/lib/analytics-proxy.ts`:
  - Allowed `PATCH` on `v1/reports/definitions/:id/formats` requiring `analytics:reports:write`. Denies `GET` and `POST`.
  - Allowed `POST` on `v1/reports/runs/:id/files/:format/download-token` requiring `analytics:export`.

### 106e: ReportsWorkbench UI update

- `apps/workflow-platform/components/analytics/reports/ReportsWorkbench.tsx`:
  - Added format checkboxes (CSV, Excel XLSX, PDF) in report creation dialog.
  - Added format badges on report cards.
  - Added "Edit formats" action using `PATCH /v1/reports/definitions/:id/formats`.
  - Added expandable "Run history" drawer fetching latest 50 runs via `GET /v1/reports/definitions/:id/runs`.
  - On-demand safe token renewal: clicking Download requests fresh token via `POST /v1/reports/runs/:id/files/:format/download-token` and initiates download.
  - Accessible status announcements with `role="status" aria-live="polite"`.
  - Keyboard accessible format controls with visible focus ring styling.

## Verification Evidence

- **Throwaway PostgreSQL 16 Proof (`proof:real-database`):**
  - Executed unmocked against an isolated disposable container (`gigalibs-analytics-proof-*`) with non-superuser runtime role (`analytics_runtime`) and forced RLS.
  - All 26 migrations applied and verified in the throwaway container.
  - All 8 steps PASSED: Demo Lab loading, maker-checker approval, yield per hectare calculation, summary query answering, filtered dashboard, legacy CSV report download, Reports v2 multi-format run (CSV, XLSX, PDF) with safe XLSX token renewal, and cross-tenant isolation.
  - **Live database status:** `gigalibs-postgres` remains at migration version 25 (`000025_place_directory`). Migration 000026 has NOT been applied to the live local database.
- **Automated Test Suite:**
  - `pnpm verify`: PASS (69/69 build units, 242 test files passed, 18 skipped, 2072 tests passed, 136 skipped; all 7 audits green: `production-data`, `all-runtime-data`, `package-dependencies`, `api-boundary`, `navigation`, `sdlc`, `layers`; module manifests check passed; 1 known `WORKFORCE_API_URL` drift).
  - `report.spec.ts`: 45 passed (45). Schema assertions for migration 26 (`idx_report_download_grants_lookup`, `idx_report_download_grants_expiry`), format selection, multi-artifact atomic persistence, failure rollback, user-bound grants (cross-user same tenant rejected with 404), expired grant messaging, transaction-scoped cleanup, and spatial scoping.
  - `report-files.spec.ts`: 7 passed (7). Excel typed cells, frozen header, formula injection neutralization, PDF vector chart embedding, table pagination, and text sanitization.
  - `reports-workbench.test.tsx`: 3 passed (3). Static markup rendering tests: accessible format selection inputs, write permission omission, polite live region announcements, and visible focus indicators.
  - `reports-v2-proof-helpers.spec.ts`: 17 passed (17). Unit tests for browser proof helpers: magic byte validation (CSV, XLSX, PDF), cell value normalization, RFC 4180 parsing, ExcelJS workbook validation (About sheet, frozen headers, formula-injection guards), new run identification, PDF text stream extraction, and fail-closed false-PASS prevention.
  - `analytics-boundary.test.ts`: 13 passed (13). BFF route authorization, method restrictions (PATCH allowed, GET/POST denied for formats; POST allowed for download-token).
  - `route-permissions.spec.ts`: 2 passed (2). All analytics controller endpoints guarded with explicit permissions.
- **Git diff check:** `git diff --check` PASSED cleanly (zero whitespace errors).
- **Playwright Browser Verification Script:** Prepared `scripts/verify-analytics-reports-v2-browser.mjs` with strict fail-closed assertions requiring all 34 live verification steps (UAT auth, real persisted PostgreSQL source, 3-format selection, real format PATCH test, exact new-run identification and SUCCEEDED polling, run history drawer, downloading all 3 files, magic byte and integrity checks, cross-format value parity across CSV/XLSX/PDF, kernel API schedule creation/execution/cleanup, and scoped member place isolation).
  - **Status:** Prepared. Not executed against live database/containers prior to owner deployment approval. No browser, schedule, or scoped-member proof is claimed until executed post-deployment.

## Open for the owner

- **Deployment & live database migration approval:** Authorize applying migration 000026 to the live local database `gigalibs-postgres` and restarting local containers.
- **Post-deployment live browser proof:** Once deployed, execute `node scripts/verify-analytics-reports-v2-browser.mjs` with UAT credentials to capture the live browser proof evidence.
- **Git commit approval:** Ready for review and commit per standard SDLC workflow.
