-- WI-OI-120av (Phase 5A): platform reference data — kernel-owned, version-locked standard sets. Workspaces READ but
-- never WRITE: the runtime role is granted SELECT only; writes happen through the owner (the platform load path). A
-- version is loaded whole with a sha256 checksum; the live version per set is the one with retiredAt NULL.
--
-- NOTE for review: this grants SELECT to a dedicated gigalibs_platform_reference role, mirroring the per-feature
-- runtime-role pattern. The module-read membership (which runtime roles inherit gigalibs_platform_reference) and the
-- end-to-end lock must be confirmed against the deployed role topology in Security review.

CREATE TABLE "platform_reference_versions" (
  "id" TEXT NOT NULL,
  "setKey" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "checksum" TEXT NOT NULL,
  "entryCount" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "loadedById" TEXT NOT NULL,
  "loadedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "retiredAt" TIMESTAMPTZ(3),
  CONSTRAINT "platform_reference_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_reference_versions_checksum_check" CHECK ("checksum" ~ '^sha256:[0-9a-f]{64}$'),
  CONSTRAINT "platform_reference_versions_count_check" CHECK ("entryCount" >= 0)
);

CREATE TABLE "platform_reference_entries" (
  "id" TEXT NOT NULL,
  "versionId" TEXT NOT NULL,
  "setKey" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "payload" JSONB,
  CONSTRAINT "platform_reference_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "platform_reference_versions_setKey_retiredAt_idx"
  ON "platform_reference_versions"("setKey", "retiredAt");
-- At most one live version per set.
CREATE UNIQUE INDEX "platform_reference_one_live_per_set"
  ON "platform_reference_versions"("setKey") WHERE "retiredAt" IS NULL;
CREATE UNIQUE INDEX "platform_reference_entries_version_code"
  ON "platform_reference_entries"("versionId", "code");
CREATE INDEX "platform_reference_entries_setKey_versionId_idx"
  ON "platform_reference_entries"("setKey", "versionId");

ALTER TABLE "platform_reference_entries"
  ADD CONSTRAINT "platform_reference_entries_versionId_fkey"
  FOREIGN KEY ("versionId") REFERENCES "platform_reference_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Locked: runtime roles read, never write.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gigalibs_platform_reference') THEN
    CREATE ROLE gigalibs_platform_reference NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END
$$;
GRANT gigalibs_platform_reference TO CURRENT_USER;
GRANT SELECT ON "platform_reference_versions", "platform_reference_entries" TO gigalibs_platform_reference;
