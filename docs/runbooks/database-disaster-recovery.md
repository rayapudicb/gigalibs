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

1. **Database Dump (pg_dump):**
   ```bash
   pg_dump -h localhost -p 5440 -U gigalibs -d gigalibs -F c -b -v -f /backups/gigalibs_backup_$(date +%Y%m%d_%H%M%S).dump
   ```
2. **Encrypted Archive Storage:** Backup archives are compressed, SHA-256 checksummed, and replicated across multi-region object storage (MinIO / S3).

## 3. Point-in-Time Recovery (PITR) & Restore Drill

1. **Restore to Isolated Recovery Instance:**
   ```bash
   pg_restore -h localhost -p 5440 -U gigalibs -d gigalibs_dr -v /backups/gigalibs_backup_latest.dump
   ```
2. **Data Consistency & Foreign Key Verification:**
   - Execute integrity checks verifying zero orphan foreign key references in `Tenant`, `User`, `Invoice`, and `WorkflowPipeline` tables.
   - Validate that all sequence counters match the maximum primary key values.
