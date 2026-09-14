# Database Disaster Recovery & Migration Runbook

Owner: DevSecOps / SRE + Backend Domain  
Work item: WI-OI-006  
Target RPO: < 1 minute (via WAL archiving)  
Target RTO: < 15 minutes (via automated container restore)

## 1. Schema Migration Protocol

1. **Forward-Only Migrations:** All schema changes must be applied through forward migrations (`prisma/migrations`). Destructive column drops require a 3-phase rollout:
   - Phase 1: Expand schema (add new column/table, mark old column as deprecated).
   - Phase 2: Dual-write (application writes to both old and new schemas).
   - Phase 3: Contract (migrate legacy reads to new column, drop legacy column in next release).
2. **Migration Execution:**
   ```bash
   pnpm db:migrate
   ```

## 2. Automated Backup Drill

1. **Isolated PostgreSQL 16 migration and logical recovery certification:**
   ```bash
   PG16_EVIDENCE_PATH=docs/audits/2026-09-09-readiness/evidence/uat/postgresql16-backup-restore-result.json \
     pnpm --dir apps/playground-api verify:postgres16-recovery
   ```
   The harness requires PostgreSQL 16, creates only timestamped `gigalibs_pg16_cert_*` databases, applies
   all forward migrations, persists an attributable IAM graph, uses same-major backup/restore tools, compares
   the restored graph and migration history and removes both databases and the temporary dump in `finally`.
   `PG16_TOOL_CONTAINER` may select the PostgreSQL 16 tools container; it defaults to the local
   `gigalibs-postgres` container.
2. **Environment backup:** Production backup automation must use the deployment's PostgreSQL 16 tools,
   encrypted immutable storage and separate credentials. Do not run the isolated harness as a substitute
   for WAL archiving, PITR or a representative-volume recovery drill.
3. **Encrypted archive storage:** Backup archives are compressed, SHA-256 checksummed, encrypted and
   replicated to the approved independent backup store. MinIO is local-UAT evidence only.

## 3. Point-in-Time Recovery (PITR) & Restore Drill

1. **Restore to an isolated recovery instance:** Never restore over the active database. Use a newly created
   database/cluster with the same PostgreSQL major and the deployment-controlled backup job.
2. **Data Consistency & Foreign Key Verification:**
   - Execute integrity checks verifying zero orphan foreign key references in `Tenant`, `User`, `Invoice`, and `WorkflowPipeline` tables.
   - Validate that all sequence counters match the maximum primary key values.
