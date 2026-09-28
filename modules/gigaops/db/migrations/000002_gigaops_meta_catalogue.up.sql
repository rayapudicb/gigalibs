-- Migration 000002: Metadata catalogue (No RLS - read-only reference data)

-- Worker classifications: W2, CONTRACTOR, CASUAL, PERMANENT, AGENCY, UNION_W2, TPV
CREATE TABLE IF NOT EXISTS gigalibs_gigaops.worker_classifications (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true
);

INSERT INTO gigalibs_gigaops.worker_classifications (code, label, is_active) VALUES
  ('W2', 'W2 Employee', true),
  ('CONTRACTOR', 'Independent Contractor', true),
  ('CASUAL', 'Casual Worker', true),
  ('PERMANENT', 'Permanent Employee', true),
  ('AGENCY', 'Agency Worker', true),
  ('UNION_W2', 'Union W2', true),
  ('TPV', 'Third Party Vendor', true)
ON CONFLICT (code) DO UPDATE SET label = EXCLUDED.label, is_active = EXCLUDED.is_active;

-- Pay type catalogue: controls which payroll rule set applies
CREATE TABLE IF NOT EXISTS gigalibs_gigaops.pay_type_catalogue (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  daily_regular_cap NUMERIC, -- NULL = flat rate
  daily_ot_cap NUMERIC,      -- NULL = no double time
  weekly_regular_cap NUMERIC NOT NULL DEFAULT 40,
  ot_multiplier NUMERIC NOT NULL DEFAULT 1.5,
  dt_multiplier NUMERIC,
  seventh_day_rule BOOLEAN NOT NULL DEFAULT false,
  is_flat_rate BOOLEAN NOT NULL DEFAULT false
);

INSERT INTO gigalibs_gigaops.pay_type_catalogue (code, label, daily_regular_cap, daily_ot_cap, weekly_regular_cap, ot_multiplier, dt_multiplier, seventh_day_rule, is_flat_rate) VALUES
  ('10ST', '10hr standard day', 10, NULL, 40, 1.5, NULL, false, false),
  ('9ST_OT9', '9hr / OT after 9', 9, NULL, 40, 1.5, NULL, false, false),
  ('8ST_8OT', 'California 8/12/DT', 8, 12, 40, 1.5, 2.0, true, false),
  ('FLAT_D', 'Flat daily rate', NULL, NULL, 0, 1.0, NULL, false, true),
  ('FLAT_W', 'Flat weekly rate', NULL, NULL, 0, 1.0, NULL, false, true),
  ('FLAT_E', 'Flat event/unit rate', NULL, NULL, 0, 1.0, NULL, false, true)
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label,
  daily_regular_cap = EXCLUDED.daily_regular_cap,
  daily_ot_cap = EXCLUDED.daily_ot_cap,
  weekly_regular_cap = EXCLUDED.weekly_regular_cap,
  ot_multiplier = EXCLUDED.ot_multiplier,
  dt_multiplier = EXCLUDED.dt_multiplier,
  seventh_day_rule = EXCLUDED.seventh_day_rule,
  is_flat_rate = EXCLUDED.is_flat_rate;

-- Skill tags: tenant-extensible freeform tags (OSHA-30, Forklift, Halal, etc.)
CREATE TABLE IF NOT EXISTS gigalibs_gigaops.skill_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID, -- NULL = platform-wide default tag
  slug TEXT NOT NULL,
  label TEXT NOT NULL,
  industry_slug TEXT, -- NULL = cross-industry
  CONSTRAINT skill_tags_tenant_slug_unique UNIQUE (tenant_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_gigaops_skill_tags_lookup
  ON gigalibs_gigaops.skill_tags (tenant_id, industry_slug);

INSERT INTO gigalibs_gigaops.schema_migrations (version, applied_at)
VALUES ('000002_gigaops_meta_catalogue', now())
ON CONFLICT (version) DO NOTHING;
