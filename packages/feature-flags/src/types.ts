export interface FeatureFlag {
  key: string;
  name: string;
  description?: string;
  isEnabled: boolean;
  percentageRollout?: number; // 0 to 100
  enabledTenants?: string[];  // explicit tenant IDs
  disabledTenants?: string[];
}

export interface FeatureContext {
  tenantId?: string;
  userId?: string;
}
