CREATE TABLE "tenant_oidc_configurations" (
  "id" TEXT NOT NULL,
  "issuer" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "clientSecretEnvelope" TEXT NOT NULL,
  "keyVersion" TEXT NOT NULL,
  "scopes" TEXT[] NOT NULL DEFAULT ARRAY['openid', 'email', 'profile']::TEXT[],
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "allowJitProvisioning" BOOLEAN NOT NULL DEFAULT false,
  "defaultRole" "MemberRole" NOT NULL DEFAULT 'MEMBER',
  "configuredById" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "tenant_oidc_configurations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "oidc_login_transactions" (
  "id" TEXT NOT NULL,
  "stateDigest" TEXT NOT NULL,
  "nonce" TEXT NOT NULL,
  "codeVerifierEnvelope" TEXT NOT NULL,
  "keyVersion" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "consumedAt" TIMESTAMPTZ(3),
  "tenantId" TEXT NOT NULL,
  "configurationId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "oidc_login_transactions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "external_identities" (
  "id" TEXT NOT NULL,
  "issuer" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "lastLoginAt" TIMESTAMPTZ(3) NOT NULL,
  "configurationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "external_identities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenant_oidc_configurations_tenantId_key" ON "tenant_oidc_configurations"("tenantId");
CREATE INDEX "tenant_oidc_configurations_enabled_idx" ON "tenant_oidc_configurations"("enabled");
CREATE UNIQUE INDEX "oidc_login_transactions_stateDigest_key" ON "oidc_login_transactions"("stateDigest");
CREATE INDEX "oidc_login_transactions_tenantId_expiresAt_idx" ON "oidc_login_transactions"("tenantId", "expiresAt");
CREATE INDEX "oidc_login_transactions_configurationId_idx" ON "oidc_login_transactions"("configurationId");
CREATE UNIQUE INDEX "external_identities_issuer_subject_key" ON "external_identities"("issuer", "subject");
CREATE UNIQUE INDEX "external_identities_configurationId_userId_key" ON "external_identities"("configurationId", "userId");
CREATE INDEX "external_identities_userId_idx" ON "external_identities"("userId");

ALTER TABLE "tenant_oidc_configurations" ADD CONSTRAINT "tenant_oidc_configurations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "oidc_login_transactions" ADD CONSTRAINT "oidc_login_transactions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "oidc_login_transactions" ADD CONSTRAINT "oidc_login_transactions_configurationId_fkey" FOREIGN KEY ("configurationId") REFERENCES "tenant_oidc_configurations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "external_identities" ADD CONSTRAINT "external_identities_configurationId_fkey" FOREIGN KEY ("configurationId") REFERENCES "tenant_oidc_configurations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "external_identities" ADD CONSTRAINT "external_identities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
