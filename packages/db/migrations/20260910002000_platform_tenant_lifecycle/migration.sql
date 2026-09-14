CREATE TYPE "PlatformRole" AS ENUM ('PLATFORM_OWNER', 'PLATFORM_ADMIN', 'PLATFORM_AUDITOR');
CREATE TYPE "PlatformRoleAssignmentStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REVOKED');
CREATE TYPE "TenantModuleEntitlementStatus" AS ENUM ('ENABLED', 'DISABLED');
CREATE TYPE "TenantModuleEntitlementSource" AS ENUM ('TRIAL', 'PLAN', 'PLATFORM_OVERRIDE');
CREATE TYPE "TenantInfrastructureStatus" AS ENUM ('REQUESTED', 'PROVISIONING', 'READY', 'FAILED');
CREATE TYPE "TenantSubdomainStatus" AS ENUM ('RESERVED', 'DNS_PENDING', 'TLS_PENDING', 'ACTIVE', 'FAILED');

CREATE TABLE "platform_role_assignments" (
  "id" TEXT NOT NULL,
  "role" "PlatformRole" NOT NULL,
  "status" "PlatformRoleAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
  "reason" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ(3),
  "revokedAt" TIMESTAMPTZ(3),
  "userId" TEXT NOT NULL,
  "grantedById" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "platform_role_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_role_assignments_reason_check" CHECK (char_length(btrim("reason")) BETWEEN 3 AND 500),
  CONSTRAINT "platform_role_assignments_lifecycle_check" CHECK (
    ("status" = 'REVOKED' AND "revokedAt" IS NOT NULL)
    OR ("status" <> 'REVOKED' AND "revokedAt" IS NULL)
  )
);

CREATE TABLE "tenant_module_entitlements" (
  "id" TEXT NOT NULL,
  "moduleKey" TEXT NOT NULL,
  "status" "TenantModuleEntitlementStatus" NOT NULL DEFAULT 'ENABLED',
  "source" "TenantModuleEntitlementSource" NOT NULL,
  "startsAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endsAt" TIMESTAMPTZ(3),
  "reason" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "tenant_module_entitlements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tenant_module_entitlements_module_key_check" CHECK ("moduleKey" ~ '^[a-z][a-z0-9-]{1,79}$'),
  CONSTRAINT "tenant_module_entitlements_reason_check" CHECK (char_length(btrim("reason")) BETWEEN 3 AND 500),
  CONSTRAINT "tenant_module_entitlements_window_check" CHECK ("endsAt" IS NULL OR "endsAt" > "startsAt")
);

CREATE TABLE "tenant_isolation_bindings" (
  "id" TEXT NOT NULL,
  "requestedMode" "TenantIsolationMode" NOT NULL,
  "effectiveMode" "TenantIsolationMode",
  "status" "TenantInfrastructureStatus" NOT NULL DEFAULT 'REQUESTED',
  "region" TEXT NOT NULL,
  "bindingReference" TEXT,
  "failureCode" TEXT,
  "failureMessage" TEXT,
  "requestedById" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "readyAt" TIMESTAMPTZ(3),
  "tenantId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "tenant_isolation_bindings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tenant_isolation_bindings_reason_check" CHECK (char_length(btrim("reason")) BETWEEN 3 AND 500),
  CONSTRAINT "tenant_isolation_bindings_ready_check" CHECK (
    ("status" = 'READY' AND "effectiveMode" IS NOT NULL AND "bindingReference" IS NOT NULL AND "readyAt" IS NOT NULL AND "failureCode" IS NULL AND "failureMessage" IS NULL)
    OR ("status" = 'FAILED' AND "effectiveMode" IS NULL AND "readyAt" IS NULL AND "failureCode" IS NOT NULL)
    OR ("status" IN ('REQUESTED', 'PROVISIONING') AND "effectiveMode" IS NULL AND "bindingReference" IS NULL AND "readyAt" IS NULL AND "failureCode" IS NULL AND "failureMessage" IS NULL)
  )
);

CREATE TABLE "tenant_subdomain_bindings" (
  "id" TEXT NOT NULL,
  "hostname" TEXT NOT NULL,
  "status" "TenantSubdomainStatus" NOT NULL DEFAULT 'RESERVED',
  "verificationRef" TEXT,
  "failureCode" TEXT,
  "failureMessage" TEXT,
  "requestedById" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "activatedAt" TIMESTAMPTZ(3),
  "tenantId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "tenant_subdomain_bindings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tenant_subdomain_bindings_hostname_check" CHECK ("hostname" = lower("hostname") AND char_length("hostname") BETWEEN 4 AND 253),
  CONSTRAINT "tenant_subdomain_bindings_reason_check" CHECK (char_length(btrim("reason")) BETWEEN 3 AND 500),
  CONSTRAINT "tenant_subdomain_bindings_lifecycle_check" CHECK (
    ("status" = 'ACTIVE' AND "verificationRef" IS NOT NULL AND "activatedAt" IS NOT NULL AND "failureCode" IS NULL AND "failureMessage" IS NULL)
    OR ("status" = 'FAILED' AND "activatedAt" IS NULL AND "failureCode" IS NOT NULL)
    OR ("status" IN ('RESERVED', 'DNS_PENDING', 'TLS_PENDING') AND "activatedAt" IS NULL AND "failureCode" IS NULL AND "failureMessage" IS NULL)
  )
);

CREATE UNIQUE INDEX "platform_role_assignments_userId_role_key" ON "platform_role_assignments"("userId", "role");
CREATE INDEX "platform_role_assignments_userId_status_expiresAt_idx" ON "platform_role_assignments"("userId", "status", "expiresAt");
CREATE INDEX "platform_role_assignments_grantedById_idx" ON "platform_role_assignments"("grantedById");

CREATE UNIQUE INDEX "tenant_module_entitlements_tenantId_moduleKey_key" ON "tenant_module_entitlements"("tenantId", "moduleKey");
CREATE INDEX "tenant_module_entitlements_tenantId_status_endsAt_idx" ON "tenant_module_entitlements"("tenantId", "status", "endsAt");

CREATE UNIQUE INDEX "tenant_isolation_bindings_tenantId_key" ON "tenant_isolation_bindings"("tenantId");
CREATE INDEX "tenant_isolation_bindings_status_region_idx" ON "tenant_isolation_bindings"("status", "region");

CREATE UNIQUE INDEX "tenant_subdomain_bindings_hostname_key" ON "tenant_subdomain_bindings"("hostname");
CREATE UNIQUE INDEX "tenant_subdomain_bindings_tenantId_key" ON "tenant_subdomain_bindings"("tenantId");
CREATE INDEX "tenant_subdomain_bindings_status_idx" ON "tenant_subdomain_bindings"("status");

ALTER TABLE "platform_role_assignments" ADD CONSTRAINT "platform_role_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "platform_role_assignments" ADD CONSTRAINT "platform_role_assignments_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tenant_module_entitlements" ADD CONSTRAINT "tenant_module_entitlements_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tenant_isolation_bindings" ADD CONSTRAINT "tenant_isolation_bindings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tenant_subdomain_bindings" ADD CONSTRAINT "tenant_subdomain_bindings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
