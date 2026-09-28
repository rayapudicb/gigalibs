-- WI-OI-063 GeofenceZone convergence: Geospatial Studio owns places and their boundaries, so the
-- control-plane circle geofences are retired. Nothing reads this table; the owner approved dropping its
-- local demo rows on 2026-09-26 after a CSV backup outside the repository.
DROP TABLE "geofence_zones";
