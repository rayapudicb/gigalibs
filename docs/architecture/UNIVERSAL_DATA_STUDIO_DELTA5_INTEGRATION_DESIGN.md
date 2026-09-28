# Architecture Design: Universal Data Studio Delta-5 Platform Foundation Adoption

- **Work Item:** WI-OI-055
- **Module:** `modules/universal-data-studio` (`@gigalibs/data-studio-api`)
- **Blueprint Release:** Release 2 (Reusable Foundations)
- **Deployment Profile:** `configuration-local-development-v1`
- **Requirements:** FR-02, FR-04, FR-07, FR-12, FR-14, FR-16; NFR-GOV-001–003, NFR-SEC-001–005, NFR-DATA-001–004, NFR-REL-001–003, NFR-PERF-001–003, NFR-OBS-001–004

---

## 1. Context & Business Drivers

Universal Data Studio & Enterprise Data Contract Engine acts as the central data contract, schema drift, and data pipeline governance plane across all business modules.
To align with ADR-0005 and the Delta-5 foundational platform standards:
1. **Cryptographic Contract Seals:** Every registered data contract must be cryptographically sealed with a deterministic SHA-256 hash linked to the tenant's prior contract seal, establishing an unbroken and tamper-evident contract governance chain.
2. **Fail-Closed Verification Engine:** The platform must provide an auditable verification routine returning discrete states: `VALID`, `UNSEALED`, `INVALID`, `INCOMPLETE`.
3. **Data Classification & Sensitive Field Redaction:** Schema-aware deep redaction must sanitize sensitive payload elements (credentials, secrets, PII, payment tokens) before persistence in drift logs, audit events, and inbox records.
4. **Transactional Inbox & Deduplication:** Inbound dataset synchronization and contract notification events must be idempotently processed via a transactional inbox table (`gigalibs_data_studio.inbox_events`), guaranteeing at-most-once processing with replay safety.

---

## 2. Technical Design

### 2.1 Database Schema Extensions (`000003_data_studio_ledger_seals_and_inbox.up.sql`)
```sql
BEGIN;

-- 1. Add seal columns to data_contracts
ALTER TABLE gigalibs_data_studio.data_contracts
  ADD COLUMN IF NOT EXISTS seal_hash VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS previous_seal_hash VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS seal_sequence BIGINT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS contracts_tenant_seal_sequence_idx
  ON gigalibs_data_studio.data_contracts (tenant_id, seal_sequence)
  WHERE seal_sequence IS NOT NULL;

-- 2. Create transactional inbox events table
CREATE TABLE IF NOT EXISTS gigalibs_data_studio.inbox_events (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  source VARCHAR(64) NOT NULL,
  event_id VARCHAR(128) NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'RECEIVED',
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ NULL,
  CONSTRAINT uq_data_studio_inbox UNIQUE (tenant_id, source, event_id)
);

ALTER TABLE gigalibs_data_studio.inbox_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_inbox ON gigalibs_data_studio.inbox_events;
CREATE POLICY tenant_isolation_inbox ON gigalibs_data_studio.inbox_events
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- 3. Register migration
INSERT INTO gigalibs_data_studio.schema_migrations (version, name, applied_at)
VALUES (3, '000003_data_studio_ledger_seals_and_inbox', NOW())
ON CONFLICT (version) DO NOTHING;

COMMIT;
```

### 2.2 Cryptographic Contract Ledger Sealing (`contract-ledger-seal.ts`)
```typescript
export interface ContractSealInput {
  tenantId: string;
  sequence: number;
  contractId: string;
  contractCode: string;
  domain: string;
  activeVersion: string;
  createdAt: string;
  previousSealHash: string;
}

export function computeContractSealHash(input: ContractSealInput): string {
  const canonicalPayload = canonicalJson({
    activeVersion: input.activeVersion,
    contractCode: input.contractCode,
    contractId: input.contractId,
    createdAt: input.createdAt,
    domain: input.domain,
    previousSealHash: input.previousSealHash,
    sequence: input.sequence,
    tenantId: input.tenantId,
  });
  return createHash('sha256').update(canonicalPayload).digest('hex');
}
```

Fail-closed evaluation return states:
- `VALID`: Unbroken, sequentially contiguous chain with matching hash fingerprints.
- `UNSEALED`: Unsealed legacy records present.
- `INVALID`: Hash rupture or content tampering detected.
- `INCOMPLETE`: Gap in sequence continuity detected.

### 2.3 Sensitive Data Redaction Engine (`data-redaction.ts`)
Scans objects recursively for sensitive keys: `password`, `token`, `secret`, `authorization`, `credit_card`, `cvv`, `api_key`, `bank_account`, `iban`, `ssn`, `tax_id`. Replaces values with `[REDACTED]` and returns list of redacted property paths.

---

## 3. Verification & Acceptance Criteria
1. Migration `000003_data_studio_ledger_seals_and_inbox.up.sql` syntax and schema idempotency.
2. Contiguous seal calculation and fail-closed verification unit tests.
3. Sensitive data redaction unit tests.
4. Transactional inbox deduplication unit tests.
5. Zero modification to 7 CMMS protected file hashes.
6. All 6 SDLC governance audits green.
