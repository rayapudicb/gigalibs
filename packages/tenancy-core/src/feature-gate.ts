import type { TenantProfile } from './types.js';

export class FeatureGate {
  /**
   * Check if a feature is enabled for a tenant
   */
  static isFeatureEnabled(tenant: TenantProfile, featureKey: string): boolean {
    if (!tenant.features) return false;
    return tenant.features.includes(featureKey) || tenant.features.includes('*');
  }

  /**
   * Check if all requested features are enabled
   */
  static hasAllFeatures(tenant: TenantProfile, featureKeys: string[]): boolean {
    return featureKeys.every((f) => this.isFeatureEnabled(tenant, f));
  }
}
