# Governed RAG Pipeline & AI Citation Runbook

Owner: AI & Data Governance + Backend Domain  
Work item: WI-OI-012  
Standard: FR-07, NFR-SEC-001, NFR-DATA-001, NFR-DATA-002

## 1. Multi-Tenant Vector Ingestion

1. **Chunking & Metadata:** Documents are chunked (512 tokens with 64-token overlap) and embedded with vector embeddings. Every chunk carries strict metadata:
   - `tenantId`: Mandatory foreign key partition.
   - `documentId`: Source document pointer.
   - `pageNumber`: Precise page attribution.
   - `sha256Hash`: Cryptographic integrity digest.

## 2. Retrieval, Citations & Hallucination Abstention

1. **Cosine Similarity Threshold:** Queries search only chunks matching `tenantId == request.tenantId`.
2. **Abstention Policy:** If the top-K retrieval similarity score is `< 0.72`, the agent abstains and responds:
   > *"Insufficient authorized context found in tenant document store to answer this inquiry."*
3. **Citation Formatting:** Responses must include inline clickable citations linking directly to the verified chunk hash and source document page.

## 3. Token Metering & Settlement

- Each RAG query calculates `inputTokens + outputTokens` and records a credit deduction against `TenantCreditLedger`.
