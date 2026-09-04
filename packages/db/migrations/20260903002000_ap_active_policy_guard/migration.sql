CREATE UNIQUE INDEX "rule_definitions_tenant_kind_active_key"
  ON "rule_definitions"("tenantId", "kind")
  WHERE "isActive" = true AND "kind" IN ('AP_THREE_WAY_MATCH', 'AP_ACTION_POLICY');
