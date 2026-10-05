-- WI-EAM-003: Maintenance Manuals, Standard Procedures & Failure Mode Hierarchy (ISO 14224 / Maximo Parity)

-- 1. Failure Codes Hierarchy (Problem -> Cause -> Remedy)
-- WI-OI-120a (owner-approved correction, 2026-10-05; never applied to any database before): one transaction,
-- permissive tenant policies with WITH CHECK (RESTRICTIVE-only policies denied every row), principal_ref, and
-- the ledger row the module migration runner requires.

BEGIN;

CREATE TABLE gigalibs_cmms.cmms_failure_codes (
    id uuid DEFAULT gen_random_uuid(),
    tenant_id gigalibs_cmms.tenant_ref NOT NULL,
    type varchar(20) NOT NULL,
    code varchar(64) NOT NULL,
    description varchar(500) NOT NULL,
    parent_code_id uuid,
    classification_id uuid,
    version integer NOT NULL DEFAULT 1,
    created_by gigalibs_cmms.principal_ref NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT cmms_failure_codes_pk PRIMARY KEY (tenant_id, id),
    CONSTRAINT cmms_failure_codes_type_check CHECK (type IN ('PROBLEM', 'CAUSE', 'REMEDY')),
    CONSTRAINT cmms_failure_codes_tenant_code_key UNIQUE (tenant_id, type, code),
    CONSTRAINT cmms_failure_codes_parent_fk FOREIGN KEY (tenant_id, parent_code_id)
        REFERENCES gigalibs_cmms.cmms_failure_codes(tenant_id, id) ON DELETE CASCADE,
    CONSTRAINT cmms_failure_codes_class_fk FOREIGN KEY (tenant_id, classification_id)
        REFERENCES gigalibs_cmms.cmms_asset_classifications(tenant_id, id) ON DELETE SET NULL
);

ALTER TABLE gigalibs_cmms.cmms_failure_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_cmms.cmms_failure_codes FORCE ROW LEVEL SECURITY;

CREATE POLICY cmms_failure_codes_tenant_isolation ON gigalibs_cmms.cmms_failure_codes
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::gigalibs_cmms.tenant_ref)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::gigalibs_cmms.tenant_ref);

CREATE INDEX cmms_failure_codes_parent_idx ON gigalibs_cmms.cmms_failure_codes(tenant_id, parent_code_id);
CREATE INDEX cmms_failure_codes_class_idx ON gigalibs_cmms.cmms_failure_codes(tenant_id, classification_id);
CREATE INDEX cmms_failure_codes_type_idx ON gigalibs_cmms.cmms_failure_codes(tenant_id, type);

-- 2. Standard Operating Procedures & Job Plans
CREATE TABLE gigalibs_cmms.cmms_job_plans (
    id uuid DEFAULT gen_random_uuid(),
    tenant_id gigalibs_cmms.tenant_ref NOT NULL,
    code varchar(64) NOT NULL,
    title varchar(200) NOT NULL,
    description text,
    classification_id uuid,
    estimated_duration_minutes integer NOT NULL DEFAULT 60,
    safety_guidelines text,
    version integer NOT NULL DEFAULT 1,
    created_by gigalibs_cmms.principal_ref NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT cmms_job_plans_pk PRIMARY KEY (tenant_id, id),
    CONSTRAINT cmms_job_plans_tenant_code_key UNIQUE (tenant_id, code),
    CONSTRAINT cmms_job_plans_class_fk FOREIGN KEY (tenant_id, classification_id)
        REFERENCES gigalibs_cmms.cmms_asset_classifications(tenant_id, id) ON DELETE SET NULL
);

ALTER TABLE gigalibs_cmms.cmms_job_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_cmms.cmms_job_plans FORCE ROW LEVEL SECURITY;

CREATE POLICY cmms_job_plans_tenant_isolation ON gigalibs_cmms.cmms_job_plans
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::gigalibs_cmms.tenant_ref)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::gigalibs_cmms.tenant_ref);

CREATE INDEX cmms_job_plans_class_idx ON gigalibs_cmms.cmms_job_plans(tenant_id, classification_id);

-- 3. Job Plan Sequential Checklist Tasks
CREATE TABLE gigalibs_cmms.cmms_job_plan_tasks (
    id uuid DEFAULT gen_random_uuid(),
    tenant_id gigalibs_cmms.tenant_ref NOT NULL,
    job_plan_id uuid NOT NULL,
    sequence integer NOT NULL,
    label varchar(240) NOT NULL,
    task_type varchar(32) NOT NULL DEFAULT 'INSPECTION',
    required boolean NOT NULL DEFAULT true,
    estimated_minutes integer NOT NULL DEFAULT 15,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT cmms_job_plan_tasks_pk PRIMARY KEY (tenant_id, id),
    CONSTRAINT cmms_job_plan_tasks_type_check CHECK (task_type IN ('INSPECTION', 'LUBRICATION', 'REPLACEMENT', 'CALIBRATION', 'SAFETY_CHECK')),
    CONSTRAINT cmms_job_plan_tasks_seq_key UNIQUE (tenant_id, job_plan_id, sequence),
    CONSTRAINT cmms_job_plan_tasks_plan_fk FOREIGN KEY (tenant_id, job_plan_id)
        REFERENCES gigalibs_cmms.cmms_job_plans(tenant_id, id) ON DELETE CASCADE
);

ALTER TABLE gigalibs_cmms.cmms_job_plan_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_cmms.cmms_job_plan_tasks FORCE ROW LEVEL SECURITY;

CREATE POLICY cmms_job_plan_tasks_tenant_isolation ON gigalibs_cmms.cmms_job_plan_tasks
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::gigalibs_cmms.tenant_ref)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::gigalibs_cmms.tenant_ref);

CREATE INDEX cmms_job_plan_tasks_plan_idx ON gigalibs_cmms.cmms_job_plan_tasks(tenant_id, job_plan_id);

-- 4. Alter work_orders to link Failure Codes & Job Plans
ALTER TABLE gigalibs_cmms.work_orders
    ADD COLUMN failure_problem_id uuid,
    ADD COLUMN failure_cause_id uuid,
    ADD COLUMN failure_remedy_id uuid,
    ADD COLUMN job_plan_id uuid,
    ADD CONSTRAINT work_orders_problem_fk FOREIGN KEY (tenant_id, failure_problem_id)
        REFERENCES gigalibs_cmms.cmms_failure_codes(tenant_id, id) ON DELETE SET NULL,
    ADD CONSTRAINT work_orders_cause_fk FOREIGN KEY (tenant_id, failure_cause_id)
        REFERENCES gigalibs_cmms.cmms_failure_codes(tenant_id, id) ON DELETE SET NULL,
    ADD CONSTRAINT work_orders_remedy_fk FOREIGN KEY (tenant_id, failure_remedy_id)
        REFERENCES gigalibs_cmms.cmms_failure_codes(tenant_id, id) ON DELETE SET NULL,
    ADD CONSTRAINT work_orders_job_plan_fk FOREIGN KEY (tenant_id, job_plan_id)
        REFERENCES gigalibs_cmms.cmms_job_plans(tenant_id, id) ON DELETE SET NULL;

CREATE INDEX work_orders_problem_idx ON gigalibs_cmms.work_orders(tenant_id, failure_problem_id);
CREATE INDEX work_orders_job_plan_idx ON gigalibs_cmms.work_orders(tenant_id, job_plan_id);

INSERT INTO gigalibs_cmms.schema_migrations (version, name)
VALUES (17, '000017_eam_failure_hierarchy_and_job_plans');

COMMIT;
