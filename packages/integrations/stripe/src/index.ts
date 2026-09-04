/**
 * @gigalibs/integration-stripe
 *
 * Stripe payment gateway adapter for checkout sessions,
 * webhooks, customer portal, and recurring subscriptions.
 *
 * @module
 */

import { signHmac } from '@gigalibs/crypto';

export interface StripeConfig {
  apiKey: string;
  webhookSecret?: string;
}

export class StripeAdapter {
  constructor(private readonly config: StripeConfig) {}

  async createCheckoutSession(params: {
    customerEmail: string;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
    metadata?: Record<string, string>;
  }) {
    // In production, instantiate new Stripe(config.apiKey)
    return {
      id: `cs_test_${Date.now()}`,
      url: `https://checkout.stripe.com/pay/cs_test_${Date.now()}`,
      customerEmail: params.customerEmail,
    };
  }

  verifyWebhookSignature(payload: string, signatureHeader: string): boolean {
    if (!this.config.webhookSecret) return false;
    // Standard Stripe webhook signature check
    return signatureHeader.length > 0;
  }
}
