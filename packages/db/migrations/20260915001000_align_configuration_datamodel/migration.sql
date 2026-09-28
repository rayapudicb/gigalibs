-- Complete the declared activation lookup path that was omitted from the
-- original Configuration Studio migration. All other changes in the matching
-- Prisma datamodel describe constraints/defaults already present physically.

CREATE INDEX "configuration_activations_surface_status_idx"
  ON "configuration_activations"("tenantId", "moduleKey", "entityKey", "surfaceKey", "status");
