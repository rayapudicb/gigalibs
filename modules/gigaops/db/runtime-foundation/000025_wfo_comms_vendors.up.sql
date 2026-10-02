-- WI-WFO-005: Compliance, multi-channel communications, vendor registry, and support tickets
BEGIN;

-- 1. Third-party Staffing Vendors & Agencies
CREATE TABLE gigalibs_workforce.wfo_vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(64) NOT NULL,
  name VARCHAR(200) NOT NULL,
  contact_email VARCHAR(200),
  contact_phone VARCHAR(50),
  connector_id VARCHAR(64),
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'SUSPENDED', 'TERMINATED')),
  tax_id VARCHAR(64),
  payment_terms VARCHAR(100),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, name)
);

CREATE INDEX wfo_vendors_tenant_status ON gigalibs_workforce.wfo_vendors (tenant_id, status);

-- Alter wfo_workers to associate vendor attribution
ALTER TABLE gigalibs_workforce.wfo_workers
  ADD COLUMN IF NOT EXISTS vendor_id UUID,
  ADD CONSTRAINT fk_wfo_workers_vendor
    FOREIGN KEY (tenant_id, vendor_id)
    REFERENCES gigalibs_workforce.wfo_vendors (tenant_id, id)
    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS wfo_workers_tenant_vendor ON gigalibs_workforce.wfo_workers (tenant_id, vendor_id);

-- 2. Frontline Broadcast & Notification Logging
CREATE TABLE gigalibs_workforce.wfo_notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(64) NOT NULL,
  recipient_worker_id UUID,
  channel VARCHAR(20) NOT NULL DEFAULT 'IN_APP'
    CHECK (channel IN ('EMAIL', 'PUSH', 'SMS', 'IN_APP')),
  event_type VARCHAR(64) NOT NULL,
  subject VARCHAR(250) NOT NULL,
  body TEXT NOT NULL,
  delivery_status VARCHAR(20) NOT NULL DEFAULT 'SENT'
    CHECK (delivery_status IN ('QUEUED', 'SENT', 'DELIVERED', 'FAILED')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, recipient_worker_id)
    REFERENCES gigalibs_workforce.wfo_workers (tenant_id, id)
    ON DELETE CASCADE
);

CREATE INDEX wfo_notification_tenant_recipient ON gigalibs_workforce.wfo_notification_log (tenant_id, recipient_worker_id);
CREATE INDEX wfo_notification_tenant_channel ON gigalibs_workforce.wfo_notification_log (tenant_id, channel, delivery_status);

-- 3. Frontline Support Tickets
CREATE TABLE gigalibs_workforce.wfo_support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(64) NOT NULL,
  worker_id UUID NOT NULL,
  category VARCHAR(32) NOT NULL DEFAULT 'GENERAL'
    CHECK (category IN ('PAYROLL', 'SCHEDULE', 'COMPLIANCE', 'EXPENSE', 'GENERAL')),
  subject VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')),
  priority VARCHAR(20) NOT NULL DEFAULT 'NORMAL'
    CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
  resolution_notes TEXT,
  assigned_to VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, worker_id)
    REFERENCES gigalibs_workforce.wfo_workers (tenant_id, id)
    ON DELETE CASCADE
);

CREATE INDEX wfo_support_tickets_tenant_status ON gigalibs_workforce.wfo_support_tickets (tenant_id, status);
CREATE INDEX wfo_support_tickets_tenant_worker ON gigalibs_workforce.wfo_support_tickets (tenant_id, worker_id);

-- Row-level security for tenant isolation
ALTER TABLE gigalibs_workforce.wfo_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_workforce.wfo_vendors FORCE ROW LEVEL SECURITY;
CREATE POLICY wfo_vendors_tenant_isolation ON gigalibs_workforce.wfo_vendors
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE gigalibs_workforce.wfo_notification_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_workforce.wfo_notification_log FORCE ROW LEVEL SECURITY;
CREATE POLICY wfo_notification_log_tenant_isolation ON gigalibs_workforce.wfo_notification_log
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE gigalibs_workforce.wfo_support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_workforce.wfo_support_tickets FORCE ROW LEVEL SECURITY;
CREATE POLICY wfo_support_tickets_tenant_isolation ON gigalibs_workforce.wfo_support_tickets
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

COMMIT;
