# Self-contained Customer-Managed Compose profile

The profile runs an isolated PostgreSQL 16 database, ordered migrations (000001–000010), NestJS API, Next.js web BFF, and background outbox worker.

## Turnkey Operations

1. **Verify Prerequisites**:
   ```bash
   ./scripts/check-prerequisites.sh
   ```
2. **Generate Secure Credentials** (zero hardcoded defaults, sets 0600 permissions on `.env`):
   ```bash
   ./scripts/generate-credentials.sh
   ```
3. **Start the Stack**:
   ```bash
   docker compose --env-file ../.env up -d --build
   ```
4. **Database Backup**:
   ```bash
   ./scripts/backup.sh
   ```
5. **Database Restore**:
   ```bash
   ./scripts/restore.sh <path-to-dump>
   ```

The web port binds only to loopback (`127.0.0.1:3401`) and API binds to `127.0.0.1:3400`. Follow `db/migrations/RECOVERY.md` for upgrade procedures.
