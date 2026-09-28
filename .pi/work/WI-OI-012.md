# WI-OI-012 — Governed AI document pipeline, RAG citations, and abstention slice

Status: Review  
Parent requirements: FR-07, NFR-SEC-001, NFR-DATA-001, NFR-DATA-002  
Producer: AI & Data Governance + Backend Domain  
Independent reviewers: Security & Privacy, Product Requirements, QA Spec  
Gate: G1–G5

## Outcome

A secure, tenant-isolated document ingestion and RAG vector pipeline that enforces strict source citations,
abstains from answering when confidence is below threshold, tracks token costs, and eliminates data leakage across tenants.

## Scope

- Multi-tenant vector isolation (vectors partitioned by `tenantId`).
- Strict source citation requirement: every AI generation must link to verified source document chunks and page numbers.
- Hallucination abstention guardrails: if cosine similarity < 0.72, the agent returns an explicit "Insufficient Context" response.
- Real-time token usage and credit ledger settlement per RAG query.

## Document Scanner & BYOM Extraction Certification (AI-01 & AI-02)

1. **AI-01 Bounded Intake & Storage Security**:
   - Migration `modules/document-scanner/db/migrations/000001_document_intake_and_ocr.up.sql` establishes `gigalibs_scanner.document_uploads` with PostgreSQL Row-Level Security (`current_setting('app.current_tenant_id', true)`).
   - Ingestion enforces 25MB bounded limit, permitted MIME types (`application/pdf`, `image/*`, `text/plain`), and deterministic SHA-256 calculation.
2. **AI-02 OCR / BYOM Engine & Human-in-the-Loop Review**:
   - Pluggable OCR adapter architecture (`ocr-adapters.ts`) supporting GigaLibs Native Engine, AWS Textract, Azure Document AI, and In-VPC vLLM / Ollama BYOM.
   - Extracts structured headers, line items, and calculates individual field confidence scores.
   - Deterministic arithmetic validation: validates $\sum \text{Line Items} == \text{Subtotal}$ and $\text{Subtotal} + \text{Tax} == \text{Total}$.
   - Human correction API (`PATCH /v1/scanner/jobs/:id/correct`) and direct Accounts Payable hand-off (`POST /v1/scanner/jobs/:id/handoff`).
3. **Route Security & Monorepo Verification**:
   - Hardened Next.js BFF proxy at `apps/workflow-platform/app/api/scanner/[...path]/route.ts`.
   - Certified with 10/10 passing tests in `scanner-boundary.test.ts` and 6/6 tests in `scanner-truth-boundary.test.ts`.
   - Monorepo health: 103/103 test files passed (931/931 tests), 6/6 SDLC governance audits passed.

