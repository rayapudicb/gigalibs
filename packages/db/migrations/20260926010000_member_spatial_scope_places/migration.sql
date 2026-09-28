-- WI-OI-063b spatial scope: Geospatial place ids (each with everything inside it) a member may reach when
-- the tenant opts in to spatial scoping. Ids rather than ltree paths, so a move keeps the assignment on the
-- same place and a re-used path never grants access. Existing members get an empty list, which only takes
-- effect after opt-in.
ALTER TABLE "tenant_members"
  ADD COLUMN "spatialScopePlaceIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
