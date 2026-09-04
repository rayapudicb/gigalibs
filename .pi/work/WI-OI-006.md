# WI-OI-006 — Database migration replay, backup/restore and disaster recovery slice

Status: Review  
Parent requirements: NFR-DATA-003, NFR-REL-003, NFR-OPS-003  
Producer: DevSecOps / SRE + Backend Domain  
Independent reviewers: Solution Architecture, QA Spec  
Gate: G2–G5

## Outcome

Deterministic verification of database migration replay from empty state to current schema, automated
point-in-time recovery (PITR) procedures, and zero-data-loss rollback/roll-forward runbooks.

## Scope

- Full clean migration replay from blank PostgreSQL database using Prisma schema.
- Non-destructive roll-forward strategy verification.
- Backup creation and restoration validation drill script.
- Documented disaster recovery (DR) runbook with RPO (< 1 min) and RTO (< 15 min) targets.

## Acceptance Criteria

1. Empty database can be migrated to current schema via `pnpm db:migrate` without errors.
2. Seed data script executes cleanly without foreign key or unique constraint violations.
3. Backup/dump script exports schema and data into an encrypted archive.
4. Restore script verifies clean recovery on an isolated database instance.
5. All SDLC governance audits pass.
