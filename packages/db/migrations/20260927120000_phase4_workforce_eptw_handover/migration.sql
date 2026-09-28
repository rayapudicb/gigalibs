-- Phase 4 / US-P4-01 & US-P4-02: Workforce Execution, ePTW Safety Gate & Two-Party Shift Handover

-- 1. Create ePTW (Electronic Permit to Work) table
CREATE TABLE IF NOT EXISTS gigalibs_workforce.permits_to_work (
  tenant_id               character varying(64) NOT NULL,
  id                      uuid NOT NULL DEFAULT gen_random_uuid(),
  permit_number           text NOT NULL,
  permit_type             text NOT NULL CHECK (permit_type = ANY (ARRAY[
                            'HOT_WORK'::text, 
                            'CONFINED_SPACE'::text, 
                            'LOCKOUT_TAGOUT'::text, 
                            'WORKING_AT_HEIGHT'::text, 
                            'ELECTRICAL_ISOLATION'::text, 
                            'HAZARDOUS_CHEMICAL'::text
                          ])),
  work_order_id           uuid,
  site_ref                uuid, -- Phase 1 Spatial Node ID
  asset_id                uuid, -- CMMS Asset ID
  status                  text NOT NULL DEFAULT 'DRAFT' CHECK (status = ANY (ARRAY[
                            'DRAFT'::text, 
                            'SUBMITTED'::text, 
                            'APPROVED'::text, 
                            'ACTIVE'::text, 
                            'SUSPENDED'::text, 
                            'CLOSED'::text, 
                            'REJECTED'::text
                          ])),
  hazards_identified      text[] NOT NULL DEFAULT ARRAY[]::text[],
  ppe_required            text[] NOT NULL DEFAULT ARRAY[]::text[],
  isolation_confirmed     boolean NOT NULL DEFAULT false,
  gas_testing_required    boolean NOT NULL DEFAULT false,
  gas_test_results        jsonb,
  valid_from              timestamptz NOT NULL,
  valid_until             timestamptz NOT NULL,
  applicant_id            text NOT NULL,
  applicant_name          text NOT NULL,
  applicant_signature     text,
  supervisor_id           text,
  supervisor_name         text,
  supervisor_signature    text,
  approved_at             timestamptz,
  closed_at               timestamptz,
  checklist_submission_id text, -- Linked Phase 2 FormSubmission ID
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT permits_to_work_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT permits_to_work_number_unique UNIQUE (tenant_id, permit_number)
);

ALTER TABLE gigalibs_workforce.permits_to_work ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_workforce.permits_to_work FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS permits_to_work_tenant_isolation ON gigalibs_workforce.permits_to_work;
CREATE POLICY permits_to_work_tenant_isolation ON gigalibs_workforce.permits_to_work
  USING (tenant_id::text = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id::text = NULLIF(current_setting('app.tenant_id', true), ''));

CREATE INDEX IF NOT EXISTS permits_to_work_site_idx ON gigalibs_workforce.permits_to_work (tenant_id, site_ref);
CREATE INDEX IF NOT EXISTS permits_to_work_wo_idx ON gigalibs_workforce.permits_to_work (tenant_id, work_order_id);

-- 2. Create Two-Party Shift Handover register
CREATE TABLE IF NOT EXISTS gigalibs_workforce.shift_handovers (
  tenant_id                  character varying(64) NOT NULL,
  id                         uuid NOT NULL DEFAULT gen_random_uuid(),
  handover_number            text NOT NULL,
  shift_name                 text NOT NULL,
  site_ref                   uuid NOT NULL, -- Phase 1 Spatial Node ID
  status                     text NOT NULL DEFAULT 'PENDING_COUNTERSIGN' CHECK (status = ANY (ARRAY[
                               'PENDING_COUNTERSIGN'::text, 
                               'COMPLETED'::text, 
                               'DISPUTED'::text
                             ])),
  outgoing_lead_id           text NOT NULL,
  outgoing_lead_name         text NOT NULL,
  outgoing_signed_at         timestamptz NOT NULL DEFAULT now(),
  outgoing_signature         text NOT NULL,
  oncoming_lead_id           text,
  oncoming_lead_name         text,
  oncoming_signed_at         timestamptz,
  oncoming_signature         text,
  completed_work_orders      text[] NOT NULL DEFAULT ARRAY[]::text[],
  pending_work_orders        text[] NOT NULL DEFAULT ARRAY[]::text[],
  offline_equipment          text[] NOT NULL DEFAULT ARRAY[]::text[],
  active_permits             text[] NOT NULL DEFAULT ARRAY[]::text[],
  safety_incidents_reported  integer NOT NULL DEFAULT 0,
  notes                      text,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shift_handovers_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT shift_handovers_number_unique UNIQUE (tenant_id, handover_number)
);

ALTER TABLE gigalibs_workforce.shift_handovers ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_workforce.shift_handovers FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shift_handovers_tenant_isolation ON gigalibs_workforce.shift_handovers;
CREATE POLICY shift_handovers_tenant_isolation ON gigalibs_workforce.shift_handovers
  USING (tenant_id::text = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id::text = NULLIF(current_setting('app.tenant_id', true), ''));

CREATE INDEX IF NOT EXISTS shift_handovers_site_idx ON gigalibs_workforce.shift_handovers (tenant_id, site_ref);

-- 3. Update gigalibs_cmms.work_orders with safety pre-task gate
ALTER TABLE gigalibs_cmms.work_orders
  ADD COLUMN IF NOT EXISTS requires_permit boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS permit_id uuid;

ALTER TABLE gigalibs_cmms.work_orders
  DROP CONSTRAINT IF EXISTS work_orders_status_check;

ALTER TABLE gigalibs_cmms.work_orders
  ADD CONSTRAINT work_orders_status_check
  CHECK (status = ANY (ARRAY[
    'OPEN'::text, 
    'PENDING_SAFETY_CLEARANCE'::text, 
    'IN_PROGRESS'::text, 
    'ON_HOLD'::text, 
    'COMPLETED'::text, 
    'CANCELLED'::text
  ]));
