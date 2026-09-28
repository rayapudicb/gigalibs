-- Migration 000001: Geospatial Assets, Geofences, and Spatial Telemetry
-- Establishes tenant-scoped geospatial data tables with PostgreSQL Row-Level Security (RLS).

CREATE SCHEMA IF NOT EXISTS gigalibs_spatial;

-- 1. Spatial Assets Table
CREATE TABLE IF NOT EXISTS gigalibs_spatial.spatial_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('FACILITY', 'FLEET', 'WAREHOUSE', 'CUSTOMER_SITE')),
  latitude numeric(9,6) NOT NULL CHECK (latitude >= -90.0 AND latitude <= 90.0),
  longitude numeric(9,6) NOT NULL CHECK (longitude >= -180.0 AND longitude <= 180.0),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'IDLE', 'MAINTENANCE')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_spatial_assets_tenant 
  ON gigalibs_spatial.spatial_assets(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_spatial_assets_coords 
  ON gigalibs_spatial.spatial_assets(latitude, longitude);

-- 2. Geofences Table
CREATE TABLE IF NOT EXISTS gigalibs_spatial.geofences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  name text NOT NULL,
  fence_type text NOT NULL DEFAULT 'POLYGON' CHECK (fence_type IN ('POLYGON', 'RADIUS')),
  center_lat numeric(9,6) CHECK (center_lat IS NULL OR (center_lat >= -90.0 AND center_lat <= 90.0)),
  center_lng numeric(9,6) CHECK (center_lng IS NULL OR (center_lng >= -180.0 AND center_lng <= 180.0)),
  radius_meters integer CHECK (radius_meters IS NULL OR radius_meters > 0),
  polygon_coordinates jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_geofences_tenant 
  ON gigalibs_spatial.geofences(tenant_id, created_at DESC);

-- 3. Spatial Events & Dispatch Table
CREATE TABLE IF NOT EXISTS gigalibs_spatial.spatial_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  asset_id uuid REFERENCES gigalibs_spatial.spatial_assets(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('GEOFENCE_ENTER', 'GEOFENCE_EXIT', 'DISPATCH_TRIGGERED')),
  latitude numeric(9,6) NOT NULL CHECK (latitude >= -90.0 AND latitude <= 90.0),
  longitude numeric(9,6) NOT NULL CHECK (longitude >= -180.0 AND longitude <= 180.0),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_spatial_events_tenant 
  ON gigalibs_spatial.spatial_events(tenant_id, recorded_at DESC);

-- 4. Row-Level Security (RLS) Configuration
ALTER TABLE gigalibs_spatial.spatial_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_spatial.geofences ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_spatial.spatial_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_spatial_assets ON gigalibs_spatial.spatial_assets;
CREATE POLICY tenant_isolation_spatial_assets ON gigalibs_spatial.spatial_assets
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_geofences ON gigalibs_spatial.geofences;
CREATE POLICY tenant_isolation_geofences ON gigalibs_spatial.geofences
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_spatial_events ON gigalibs_spatial.spatial_events;
CREATE POLICY tenant_isolation_spatial_events ON gigalibs_spatial.spatial_events
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
