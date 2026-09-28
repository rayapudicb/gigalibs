-- Migration 000001: Communications Foundation, Telephony & Omnichannel Messaging
-- Establishes tenant-scoped communications schema with PostgreSQL Row-Level Security (RLS).

CREATE SCHEMA IF NOT EXISTS gigalibs_communications;

-- 1. Channel Configurations (Twilio, ACS, WhatsApp)
CREATE TABLE IF NOT EXISTS gigalibs_communications.channel_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  name text NOT NULL,
  channel_type text NOT NULL CHECK (channel_type IN ('SMS', 'WHATSAPP', 'VOICE', 'EMAIL')),
  provider text NOT NULL CHECK (provider IN ('TWILIO', 'AZURE_COMMUNICATION_SERVICES', 'SMTP_SENDGRID')),
  sender_address text NOT NULL,
  vault_secret_id text,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'TESTING')),
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_channel_configs_tenant 
  ON gigalibs_communications.channel_configs(tenant_id, channel_type);

-- 2. Message Templates (Operational dispatch, Work orders, Reminders)
CREATE TABLE IF NOT EXISTS gigalibs_communications.message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  channel_type text NOT NULL CHECK (channel_type IN ('SMS', 'WHATSAPP', 'VOICE', 'EMAIL')),
  body_template text NOT NULL,
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  category text NOT NULL CHECK (category IN ('OPERATIONS', 'FINANCIAL', 'SECURITY', 'MARKETING')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_message_templates_tenant 
  ON gigalibs_communications.message_templates(tenant_id, is_active);

-- 3. Conversations (Omnichannel threads)
CREATE TABLE IF NOT EXISTS gigalibs_communications.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  channel_config_id uuid REFERENCES gigalibs_communications.channel_configs(id) ON DELETE SET NULL,
  channel_type text NOT NULL CHECK (channel_type IN ('SMS', 'WHATSAPP', 'VOICE', 'EMAIL')),
  contact_name text NOT NULL,
  contact_address text NOT NULL,
  subject text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'PENDING', 'RESOLVED', 'CLOSED')),
  source_module text NOT NULL DEFAULT 'DIRECT' CHECK (source_module IN ('CMMS', 'AR', 'SPEND', 'DIRECT', 'DISPATCH')),
  entity_reference_id text,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversations_tenant 
  ON gigalibs_communications.conversations(tenant_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_entity 
  ON gigalibs_communications.conversations(tenant_id, source_module, entity_reference_id);

-- 4. Messages (Inbound / Outbound with Delivery Receipts)
CREATE TABLE IF NOT EXISTS gigalibs_communications.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES gigalibs_communications.conversations(id) ON DELETE CASCADE,
  tenant_id text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('INBOUND', 'OUTBOUND')),
  channel_type text NOT NULL CHECK (channel_type IN ('SMS', 'WHATSAPP', 'VOICE', 'EMAIL')),
  sender text NOT NULL,
  recipient text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'READ')),
  provider_message_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation 
  ON gigalibs_communications.messages(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_messages_tenant 
  ON gigalibs_communications.messages(tenant_id, created_at DESC);

-- 5. Call Attempts (WebRTC Softphone, Dialpad, Recordings)
CREATE TABLE IF NOT EXISTS gigalibs_communications.call_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  conversation_id uuid REFERENCES gigalibs_communications.conversations(id) ON DELETE SET NULL,
  provider text NOT NULL CHECK (provider IN ('TWILIO', 'AZURE_COMMUNICATION_SERVICES')),
  caller_address text NOT NULL,
  recipient_address text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('INBOUND', 'OUTBOUND')),
  status text NOT NULL DEFAULT 'INITIATED' CHECK (status IN ('INITIATED', 'RINGING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'BUSY', 'NO_ANSWER')),
  duration_seconds integer NOT NULL DEFAULT 0,
  provider_call_id text,
  recording_url text,
  transcript_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_call_attempts_tenant 
  ON gigalibs_communications.call_attempts(tenant_id, created_at DESC);

-- 6. Communications Usage Ledger (Atomic consumption metering & billing)
CREATE TABLE IF NOT EXISTS gigalibs_communications.communications_usage_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  billing_period text NOT NULL, -- YYYY-MM
  channel_type text NOT NULL CHECK (channel_type IN ('SMS', 'WHATSAPP', 'VOICE', 'EMAIL')),
  unit_count integer NOT NULL DEFAULT 0,
  rated_amount_usd numeric(12,4) NOT NULL DEFAULT 0.0000,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, billing_period, channel_type)
);

CREATE INDEX IF NOT EXISTS idx_communications_usage_ledger_tenant 
  ON gigalibs_communications.communications_usage_ledger(tenant_id, billing_period);

-- 7. Row-Level Security (RLS) Configuration
ALTER TABLE gigalibs_communications.channel_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_communications.message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_communications.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_communications.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_communications.call_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_communications.communications_usage_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_channel_configs ON gigalibs_communications.channel_configs
  USING (tenant_id = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation_message_templates ON gigalibs_communications.message_templates
  USING (tenant_id = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation_conversations ON gigalibs_communications.conversations
  USING (tenant_id = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation_messages ON gigalibs_communications.messages
  USING (tenant_id = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation_call_attempts ON gigalibs_communications.call_attempts
  USING (tenant_id = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation_usage_ledger ON gigalibs_communications.communications_usage_ledger
  USING (tenant_id = current_setting('app.tenant_id', true));
