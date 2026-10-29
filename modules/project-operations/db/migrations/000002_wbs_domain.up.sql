-- WI-OI-129 S1: Project WBS, issues, timesheets, and labor rates with tenant RLS and owning org unit.
BEGIN;

CREATE TABLE gigalibs_project_operations.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  project_code varchar(64) NOT NULL,
  name varchar(200) NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'ACTIVE', 'ON_HOLD', 'COMPLETE', 'CANCELLED')),
  org_unit_id varchar(64) NOT NULL,
  customer_party_id uuid,
  currency_code char(3) NOT NULL DEFAULT 'USD',
  budget_amount_minor bigint NOT NULL DEFAULT 0 CHECK (budget_amount_minor >= 0),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  planned_start date,
  planned_end date,
  created_by varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, project_code)
);

CREATE TABLE gigalibs_project_operations.project_phases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  project_id uuid NOT NULL,
  phase_number integer NOT NULL CHECK (phase_number > 0),
  name varchar(200) NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'PLANNED'
    CHECK (status IN ('PLANNED', 'ACTIVE', 'COMPLETE', 'CANCELLED')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  planned_start date,
  planned_end date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, project_id, phase_number),
  FOREIGN KEY (tenant_id, project_id) REFERENCES gigalibs_project_operations.projects (tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE gigalibs_project_operations.project_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  project_id uuid NOT NULL,
  phase_id uuid NOT NULL,
  task_number integer NOT NULL CHECK (task_number > 0),
  name varchar(200) NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'PLANNED'
    CHECK (status IN ('PLANNED', 'ACTIVE', 'COMPLETE', 'CANCELLED')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  planned_hours numeric(18, 6) NOT NULL DEFAULT 0 CHECK (planned_hours >= 0),
  planned_start date,
  planned_end date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, phase_id, task_number),
  FOREIGN KEY (tenant_id, project_id) REFERENCES gigalibs_project_operations.projects (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, phase_id) REFERENCES gigalibs_project_operations.project_phases (tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE gigalibs_project_operations.project_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  project_id uuid NOT NULL,
  task_id uuid,
  line_number integer NOT NULL CHECK (line_number > 0),
  line_kind varchar(32) NOT NULL CHECK (line_kind IN ('MATERIAL', 'LABOR', 'EXPENSE', 'MILESTONE')),
  description varchar(500) NOT NULL,
  product_id uuid,
  uom_id uuid,
  planned_quantity numeric(18, 6) NOT NULL DEFAULT 0 CHECK (planned_quantity >= 0),
  planned_amount_minor bigint NOT NULL DEFAULT 0 CHECK (planned_amount_minor >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, project_id, line_number),
  FOREIGN KEY (tenant_id, project_id) REFERENCES gigalibs_project_operations.projects (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, task_id) REFERENCES gigalibs_project_operations.project_tasks (tenant_id, id) ON DELETE SET NULL
);

CREATE TABLE gigalibs_project_operations.project_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  project_id uuid NOT NULL,
  task_id uuid,
  issue_number integer NOT NULL CHECK (issue_number > 0),
  product_id uuid NOT NULL,
  uom_id uuid NOT NULL,
  quantity numeric(18, 6) NOT NULL CHECK (quantity > 0),
  issued_at timestamptz NOT NULL DEFAULT now(),
  inventory_issue_id uuid,
  status varchar(32) NOT NULL DEFAULT 'POSTED'
    CHECK (status IN ('DRAFT', 'POSTED', 'REVERSED')),
  created_by varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, project_id, issue_number),
  FOREIGN KEY (tenant_id, project_id) REFERENCES gigalibs_project_operations.projects (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, task_id) REFERENCES gigalibs_project_operations.project_tasks (tenant_id, id) ON DELETE SET NULL
);

CREATE TABLE gigalibs_project_operations.labor_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  rate_code varchar(64) NOT NULL,
  name varchar(200) NOT NULL,
  currency_code char(3) NOT NULL DEFAULT 'USD',
  hourly_rate_minor bigint NOT NULL CHECK (hourly_rate_minor >= 0),
  is_active boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, rate_code, effective_from)
);

CREATE TABLE gigalibs_project_operations.timesheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  project_id uuid NOT NULL,
  task_id uuid NOT NULL,
  worker_subject varchar(128) NOT NULL,
  labor_rate_id uuid NOT NULL,
  work_date date NOT NULL,
  hours numeric(18, 6) NOT NULL CHECK (hours > 0),
  status varchar(32) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'BILLED')),
  notes varchar(2000),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, task_id, worker_subject, work_date),
  FOREIGN KEY (tenant_id, project_id) REFERENCES gigalibs_project_operations.projects (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, task_id) REFERENCES gigalibs_project_operations.project_tasks (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, labor_rate_id) REFERENCES gigalibs_project_operations.labor_rates (tenant_id, id)
);

DO $$
DECLARE
  relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY[
    'projects', 'project_phases', 'project_tasks', 'project_lines',
    'project_issues', 'labor_rates', 'timesheets'
  ] LOOP
    EXECUTE format('ALTER TABLE gigalibs_project_operations.%I ENABLE ROW LEVEL SECURITY', relation);
    EXECUTE format('ALTER TABLE gigalibs_project_operations.%I FORCE ROW LEVEL SECURITY', relation);
    EXECUTE format(
      'CREATE POLICY %I ON gigalibs_project_operations.%I FOR ALL USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')) WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), ''''))',
      relation || '_tenant_isolation',
      relation
    );
  END LOOP;
END
$$;

INSERT INTO gigalibs_project_operations.schema_migrations (version, name)
VALUES (2, '000002_wbs_domain')
ON CONFLICT (version) DO NOTHING;

COMMIT;
