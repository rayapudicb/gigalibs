ALTER TABLE "workflow_pipelines"
  ADD COLUMN "activeVersion" INTEGER;

CREATE TABLE "workflow_versions" (
  "id" TEXT NOT NULL,
  "pipelineId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "definition" JSONB NOT NULL,
  "inputSchema" JSONB NOT NULL,
  "outputSchema" JSONB NOT NULL,
  "checksum" TEXT NOT NULL,
  "schemaVersion" TEXT NOT NULL,
  "compilerVersion" TEXT NOT NULL,
  "validationReport" JSONB NOT NULL,
  "publishedById" TEXT NOT NULL,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workflow_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workflow_versions_pipelineId_version_key"
  ON "workflow_versions"("pipelineId", "version");
CREATE INDEX "workflow_versions_tenantId_publishedAt_idx"
  ON "workflow_versions"("tenantId", "publishedAt" DESC);
CREATE INDEX "workflow_versions_checksum_idx"
  ON "workflow_versions"("checksum");

ALTER TABLE "workflow_versions"
  ADD CONSTRAINT "workflow_versions_pipelineId_fkey"
  FOREIGN KEY ("pipelineId") REFERENCES "workflow_pipelines"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflow_versions"
  ADD CONSTRAINT "workflow_versions_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION prevent_workflow_version_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Published workflow versions are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "workflow_versions_immutable"
  BEFORE UPDATE OR DELETE ON "workflow_versions"
  FOR EACH ROW EXECUTE FUNCTION prevent_workflow_version_mutation();
