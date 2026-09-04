# STRIDE Threat Model & RBAC Permission Matrix

Owner: Security & Privacy + Solution Architecture  
Work item: WI-OI-005  
Status: Review  
Standard: OWASP ASVS Level 2, SOC 2 Type II, NIST SP 800-53

## 1. STRIDE Threat Analysis

| Threat Category | Target Boundary | Mitigation in GigaLibs |
| :--- | :--- | :--- |
| **Spoofing** | Inbound API & Webhooks | JWT Bearer verification, HMAC-SHA256 signature verification (`ExecutionEventSignatureGuard`), W3C Traceparent validation. |
| **Tampering** | Persisted Payloads & Ledger | AES-256-GCM AEAD encryption with authentication tags (`PayloadCryptoService`), Prisma transactional isolation. |
| **Repudiation** | Operator Actions & Invoices | Immutable `AuditLog` records containing actor ID, tenant ID, IP hash, before/after diffs, and timestamp. |
| **Information Disclosure** | Multi-Tenant Data | `TenantBoundaryGuard` enforcement, isolated database/schema modes, sanitization of stack traces in 5xx error responses. |
| **Denial of Service** | API Endpoints & DLQ | Ingress rate limiting, BullMQ queue throttling, circuit breaker cooldowns on connector failures. |
| **Elevation of Privilege** | RBAC Roles | Strict server-side permission checks on every controller method; no client-trusted role flags. |

## 2. Multi-Tenant RBAC Matrix

| Role | Tenant Admin | Invoices & Spend | Workflow DAGs | Settings / Keys | Audit Logs | Metrics / Scraping |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `SUPER_ADMIN` | Full | Full | Full | Full | Full | Scraper Token |
| `TENANT_ADMIN`| Tenant Scope | Full | Full | Tenant Scope | Read-Only | Denied |
| `MANAGER`     | Denied | Create/Approve | View/Run | Denied | Read-Only | Denied |
| `MEMBER`      | Denied | Read/Create | View Only | Denied | Denied | Denied |
| `VIEWER`      | Denied | Read-Only | View Only | Denied | Denied | Denied |
| `GUEST`       | Denied | Denied | Denied | Denied | Denied | Denied |

## 3. Data Classification Taxonomy

1. **PUBLIC:** Public marketing content, static documentation assets, open API schemas.
2. **INTERNAL:** Anonymized execution metrics, system health statuses, route templates.
3. **CONFIDENTIAL:** Invoices, tenant business rules, vendor contracts, user contact emails. (Encrypted in transit TLS 1.3).
4. **RESTRICTED:** Payment credentials, API private keys, SSN/tax IDs, encryption master keys. (AES-256-GCM AEAD encrypted at rest and in transit).
