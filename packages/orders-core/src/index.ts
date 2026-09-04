/**
 * @gigalibs/orders-core
 *
 * Order Management System (OMS) lifecycle state machine,
 * fulfillment tracker, and order numbering.
 *
 * @module
 */

import { generateId } from '@gigalibs/crypto';

export type OrderStatus = 'CREATED' | 'PAID' | 'PROCESSING' | 'FULFILLED' | 'REFUNDED' | 'CANCELLED';

export interface Order {
  id: string;
  tenantId: string;
  orderNumber: string; // e.g. "ORD-9281"
  customerId: string;
  status: OrderStatus;
  currency: string;
  totalAmount: number;
  createdAt: Date;
  updatedAt: Date;
}

export class OrderLifecycle {
  static canTransition(current: OrderStatus, next: OrderStatus): boolean {
    const transitions: Record<OrderStatus, OrderStatus[]> = {
      CREATED: ['PAID', 'CANCELLED'],
      PAID: ['PROCESSING', 'REFUNDED', 'CANCELLED'],
      PROCESSING: ['FULFILLED', 'REFUNDED'],
      FULFILLED: ['REFUNDED'],
      REFUNDED: [],
      CANCELLED: [],
    };

    return transitions[current]?.includes(next) ?? false;
  }

  static createOrder(tenantId: string, customerId: string, totalAmount: number, currency = 'USD'): Order {
    return {
      id: generateId(),
      tenantId,
      orderNumber: `ORD-${Date.now().toString().slice(-6)}`,
      customerId,
      status: 'CREATED',
      currency,
      totalAmount,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}
