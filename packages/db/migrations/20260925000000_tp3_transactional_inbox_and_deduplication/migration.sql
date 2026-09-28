-- Migration: 20260925000000_tp3_transactional_inbox_and_deduplication
-- Additive forward migration establishing platform_inbox_events and PlatformInboxStatus enum

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PlatformInboxStatus') THEN
    CREATE TYPE "PlatformInboxStatus" AS ENUM (
      'RECEIVED',
      'PROCESSING',
      'PROCESSED',
      'FAILED',
      'DEAD_LETTER'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "platform_inbox_events" (
  "id" VARCHAR(30) PRIMARY KEY,
  "tenantId" VARCHAR(30) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "consumerGroup" VARCHAR(64) NOT NULL,
  "messageId" VARCHAR(128) NOT NULL,
  "eventType" VARCHAR(128) NOT NULL,
  "aggregateType" VARCHAR(64),
  "aggregateId" VARCHAR(128),
  "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "status" "PlatformInboxStatus" NOT NULL DEFAULT 'RECEIVED',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "heartbeatAt" TIMESTAMPTZ(3),
  "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMPTZ(3),
  "deadLetteredAt" TIMESTAMPTZ(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "platform_inbox_events_tenant_group_msg_idx"
  ON "platform_inbox_events"("tenantId", "consumerGroup", "messageId");

CREATE INDEX IF NOT EXISTS "platform_inbox_events_poll_idx"
  ON "platform_inbox_events"("consumerGroup", "status", "availableAt")
  WHERE "status" IN ('RECEIVED', 'PROCESSING', 'FAILED');

ALTER TABLE "platform_inbox_events" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'platform_inbox_events' AND policyname = 'platform_inbox_events_tenant_isolation'
  ) THEN
    CREATE POLICY "platform_inbox_events_tenant_isolation" ON "platform_inbox_events"
      FOR ALL
      USING ("tenantId" = current_setting('app.current_tenant_id', true));
  END IF;
END $$;
