/**
 * @gigalibs/integration-razorpay
 *
 * Razorpay payments, subscriptions, and signature verification.
 *
 * @module
 */

import { verifyHmac } from '@gigalibs/crypto';

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
}

export class RazorpayAdapter {
  constructor(private readonly config: RazorpayConfig) {}

  async createOrder(params: {
    amount: number; // in paise
    currency?: string;
    receipt?: string;
    notes?: Record<string, string>;
  }) {
    return {
      id: `order_${Date.now()}`,
      amount: params.amount,
      currency: params.currency ?? 'INR',
      receipt: params.receipt,
      status: 'created',
    };
  }

  verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
    const payload = `${orderId}|${paymentId}`;
    return verifyHmac(this.config.keySecret, payload, signature);
  }
}
