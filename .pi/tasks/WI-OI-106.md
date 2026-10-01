# WI-OI-106: Reports v2, PDF and Excel (ADR-0016 F17)

- **Status:** In progress (completion slice: automated implementation and throwaway DB proof complete; live deployment and live browser proof pending owner approval).
- **Work item:** WI-OI-106. Evidence in `.pi/work/WI-OI-106.md`.
- **Size:** L. Five pieces, built in one batch with a single deploy.

## Goal

Agriculture plan phase 6 exit: "a scheduled report arrives as PDF and Excel that match the screen." A report (a saved
chart or a dashboard) produces, besides today's CSV, an Excel workbook and a PDF with the charts drawn on the server,
the filters and data freshness stated, and a data table under each chart.

## What exists (checked 2026-10-01)

- **Reports (WI-OI-103e, F11):** a report is a saved chart or a dashboard. Each run re-asks its questions with the
  runner's rights (place scope included, WI-OI-105) and stores one CSV in `report_artifacts`, downloaded with a
  short-lived token (`analytics:export`). The CSV already neutralises text that a spreadsheet would run as a formula.
- **Schedules (WI-OI-104c):** the kernel runs a report on a schedule as its owner (`analytics.report-run`).
- **Delivery:** migration 000009 created `report_deliveries` and the channels EMAIL, WEBHOOK, SFTP and IN_APP, but
  nothing sends. The platform has no working outbound email: Communications is a prototype (maturity CONCEPT).
- **Charts:** the screen draws charts with ECharts 6 from `toEChartsOption` and `placeMap`
  (`apps/workflow-platform/lib/analytics/chart-render.ts`), pure functions with colours passed in.
- **Libraries already in the workspace:** `exceljs` 4.4.0 (CMMS), `pdfkit` 0.15.2 (Accounts Receivable), `echarts`
  6.1.0 (web). Not present: anything that draws SVG into a PDF, or an XML parser.

## Pieces (recommended design)

1. **106a Formats.** A report chooses its formats (CSV, Excel, PDF; CSV by default, as today). A run stores one file
   per format; each has its own download token and checksum. Migration 000026.
2. **106b Excel.** One sheet per chart (a dashboard gives one per tile) and an "About" sheet (report, generated at,
   freshness and watermark, filters applied, measure versions). Cells keep their types (numbers, dates with formats);
   the header row is frozen. No formula is ever written; text that starts like a formula is prefixed exactly as in
   the CSV.
3. **106c PDF with server-drawn charts (D1, D3).** The chart option builders move from the web into a shared package,
   so the screen and the PDF draw the same chart. On the server, ECharts renders each chart to SVG, which is drawn into
   the PDF as vectors. Each section has its title, the chart, the filters and freshness, and a data table (long tables
   continue on the next page, with a "first N rows" note when cut). Place maps are drawn from the member's own place
   directory, so a scoped member's PDF shows only their places. Page numbers and the generation time in the footer.
4. **106d Delivery and the screen (D2).** In-app: the Reports screen picks formats, shows each run's files, and
   downloads them; scheduled runs keep their files there. Signed download links stay short-lived and per file. Email,
   webhook and SFTP delivery wait for an outbound channel capability (see D2).
5. **106e Proof.** Unit tests (Excel cell types and injection, PDF content with compression off, chart SVG); a live
   browser proof: a dashboard report scheduled through the kernel produces PDF and Excel whose numbers equal the
   screen's, and a scoped member's PDF holds only their places.

## Decisions for the owner

- **D1, how charts are drawn in the PDF:** ECharts renders SVG on the server, drawn into the PDF as vectors
  (recommended: the same library and option builder as the screen, no browser inside the service; F17 says "charts
  rendered on the server"). Or: headless Chrome prints the screen (closest to pixels, but a browser in the Analytics
  image, heavier and a larger attack surface).
- **D2, delivery channels:** in-app files and signed download links now; email, webhook and SFTP when an outbound
  channel capability exists (recommended: nothing sends email today, and that needs a provider and credentials
  decision of its own). Or: build an email sender inside WI-OI-106 (needs a mail provider and its credentials).
  This narrows the plan's wording "delivered through the existing channels".
- **D3, one chart builder:** move `toEChartsOption` and `placeMap` from the web into a shared package used by both the
  web and Analytics (recommended). Or: a separate server copy (two places to keep in step).
- **D4, Excel rules:** typed cells, one sheet per chart plus "About", no formulas ever, formula-like text prefixed
  (recommended, the CSV rule).
- **D5, one new library:** `svg-to-pdfkit` 0.1.8 to draw ECharts' SVG into PDFKit (recommended). Facts (npm,
  2026-10-01): MIT; its only dependency is `pdfkit`; 4.2 MB unpacked, mostly tests and examples (the runtime is one
  file); last released in 2022, so stable but unmaintained. It handles the gradients, clip paths and text ECharts
  emits, and it only ever reads SVG we generate, never user-supplied SVG; pinned to the exact version. Or: our own
  SVG drawer (no new dependency, but it also needs its own SVG parser, as the workspace has none, and gradient and
  clip-path support: more of our own code to keep correct). `exceljs`, `pdfkit` and `echarts` are reused at the
  versions already in the workspace.

## Stop and ask if

- a report's CSV output would change for existing reports;
- the PDF would need a browser or a native binary in the Analytics image.
