-- WI-OI-120hp (R3, segregation of duties): a workspace administrator's recorded acceptance of a specific
-- duty-conflict set for a member (a compensating control). Additive only — a new table, no change to existing ones.
BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE TABLE "duty_conflict_acceptances" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "conflictSetId" TEXT NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "acceptedById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "revokedAt" TIMESTAMPTZ(3),
  "revokedById" TEXT,
  "revokeReason" VARCHAR(500),
  CONSTRAINT "duty_conflict_acceptances_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "duty_conflict_acceptances_member_idx" ON "duty_conflict_acceptances" ("tenantId", "userId");

ALTER TABLE "duty_conflict_acceptances"
  ADD CONSTRAINT "duty_conflict_acceptances_member_fkey"
  FOREIGN KEY ("userId", "tenantId") REFERENCES "tenant_members" ("userId", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
