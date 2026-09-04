# Usage Metering, Rate Limiting & Billing Reconciliation Runbook

Owner: Backend & Data Engineer + Finance / Domain Expert  
Work item: WI-OI-015  
Standard: FR-16, NFR-FIN-001, NFR-SEC-001, NFR-REL-002

## 1. Real-Time Consumption Metering

1. **Metered Dimensions:**
   - `api_requests_total`: Inbound API invocations per tenant.
   - `workflow_execution_credits`: Settled compute credits per DAG run.
   - `ai_tokens_consumed`: Input and output token counts for RAG queries.
   - `storage_bytes_stored`: Active file storage volume in MinIO/S3.
2. **Atomic Ingestion:** Metrics are recorded in Redis sliding windows and flushed to PostgreSQL `TenantUsageLedger` every 60 seconds.

## 2. Hard & Soft Quota Enforcement

- **80% and 90% Thresholds:** Emits warning webhooks and in-app alerts to tenant admins.
- **100% Hard Cap (Non-Enterprise):** Inbound requests return HTTP 429 Too Many Requests with retry-after headers and an upgrade payload.

## 3. Automated Monthly Invoice Settlement

- On the 1st of every month, the billing engine aggregates usage records, calculates overage charges according to the tenant's plan pricing matrix, generates an immutable `Invoice` record, and syncs the invoice to Stripe/Lago billing endpoints.
