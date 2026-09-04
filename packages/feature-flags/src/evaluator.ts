import type { FeatureFlag, FeatureContext } from './types.js';

export class FeatureFlagEvaluator {
  /**
   * Deterministic hash bucket (0-99) based on identifier string.
   */
  private static getBucket(identifier: string): number {
    let hash = 0;
    for (let i = 0; i < identifier.length; i++) {
      hash = (hash << 5) - hash + identifier.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash) % 100;
  }

  static isEnabled(flag: FeatureFlag, context?: FeatureContext): boolean {
    if (!flag.isEnabled) return false;

    // Check explicit tenant blacklist
    if (context?.tenantId && flag.disabledTenants?.includes(context.tenantId)) {
      return false;
    }

    // Check explicit tenant whitelist
    if (context?.tenantId && flag.enabledTenants?.includes(context.tenantId)) {
      return true;
    }

    // Percentage rollout
    if (flag.percentageRollout !== undefined && flag.percentageRollout < 100) {
      const identifier = context?.userId || context?.tenantId;
      if (!identifier) return false;
      const bucket = this.getBucket(`${flag.key}:${identifier}`);
      return bucket < flag.percentageRollout;
    }

    return true;
  }
}
