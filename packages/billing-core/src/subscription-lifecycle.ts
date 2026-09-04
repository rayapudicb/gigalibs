import type { SubscriptionStatus } from './types.js';

export class SubscriptionLifecycle {
  /**
   * Determine valid next states from current subscription status.
   */
  static getValidTransitions(current: SubscriptionStatus): SubscriptionStatus[] {
    switch (current) {
      case 'trialing':
        return ['active', 'canceled', 'paused'];
      case 'active':
        return ['past_due', 'paused', 'canceled'];
      case 'past_due':
        return ['active', 'unpaid', 'canceled'];
      case 'unpaid':
        return ['active', 'canceled'];
      case 'incomplete':
        return ['active', 'canceled'];
      case 'paused':
        return ['active', 'canceled'];
      case 'canceled':
        return ['active']; // Reactivation
      default:
        return [];
    }
  }

  static canAccessPaidFeatures(status: SubscriptionStatus): boolean {
    return status === 'active' || status === 'trialing';
  }
}
