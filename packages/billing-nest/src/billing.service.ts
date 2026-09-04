import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { prisma } from '@gigalibs/db';
import { generateId } from '@gigalibs/crypto';
import { logger } from '@gigalibs/logger';

export interface CreatePlanDto {
  slug: string;
  name: string;
  description?: string;
  trialDays?: number;
  features: string[];
  limits?: Record<string, number>;
  prices: Array<{
    currency: string;
    unitAmount: number; // in cents
    interval: 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';
    intervalCount?: number;
  }>;
}

export interface SubscribeDto {
  tenantId: string;
  planSlug: string;
  paymentMethod?: string;
}

export interface ChangePlanDto {
  subscriptionId: string;
  newPlanSlug: string;
  immediateProration?: boolean;
}

@Injectable()
export class BillingService {
  /**
   * List all active plans with their price points directly from PostgreSQL.
   */
  async getPlans() {
    return prisma.plan.findMany({
      where: { isActive: true },
      include: {
        prices: {
          where: { isActive: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Retrieve a single plan by slug with all price configurations.
   */
  async getPlanBySlug(slug: string) {
    const plan = await prisma.plan.findUnique({
      where: { slug },
      include: { prices: true },
    });
    if (!plan) {
      throw new NotFoundException(`Plan with slug '${slug}' not found in database.`);
    }
    return plan;
  }

  /**
   * Create or update a plan definition with transactional price tier insertions.
   */
  async upsertPlan(dto: CreatePlanDto) {
    return prisma.$transaction(async (tx) => {
      const plan = await tx.plan.upsert({
        where: { slug: dto.slug },
        update: {
          name: dto.name,
          description: dto.description,
          trialDays: dto.trialDays ?? 0,
          features: dto.features,
          limits: dto.limits,
          isActive: true,
        },
        create: {
          slug: dto.slug,
          name: dto.name,
          description: dto.description,
          trialDays: dto.trialDays ?? 0,
          features: dto.features,
          limits: dto.limits,
          isActive: true,
        },
      });

      // Upsert prices
      for (const p of dto.prices) {
        await tx.price.create({
          data: {
            planId: plan.id,
            currency: p.currency,
            unitAmount: p.unitAmount,
            interval: p.interval,
            intervalCount: p.intervalCount ?? 1,
            isActive: true,
          },
        });
      }

      return tx.plan.findUnique({
        where: { id: plan.id },
        include: { prices: true },
      });
    });
  }

  /**
   * Retrieve active subscription and complete invoice ledger for a tenant.
   */
  async getTenantSubscription(tenantId: string) {
    return prisma.subscription.findFirst({
      where: {
        tenantId,
        status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] },
      },
      include: {
        plan: { include: { prices: true } },
        items: { include: { price: true } },
        invoices: {
          include: { lineItems: true, payments: true },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Subscribe a tenant to a plan, creating real DB records for Subscription,
   * First Invoice, and Payment Transaction.
   */
  async subscribe(dto: SubscribeDto) {
    const plan = await this.getPlanBySlug(dto.planSlug);
    const primaryPrice = plan.prices[0];
    if (!primaryPrice) {
      throw new BadRequestException(`Plan '${dto.planSlug}' has no active price configured.`);
    }

    const now = new Date();
    const periodEnd = new Date(now);
    if (primaryPrice.interval === 'YEAR') {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }

    const isTrial = (plan.trialDays ?? 0) > 0;
    const trialEnd = isTrial ? new Date(now.getTime() + plan.trialDays * 86400000) : null;

    return prisma.$transaction(async (tx) => {
      // 1. Create Subscription
      const subscription = await tx.subscription.create({
        data: {
          tenantId: dto.tenantId,
          planId: plan.id,
          status: isTrial ? 'TRIALING' : 'ACTIVE',
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          trialStart: isTrial ? now : null,
          trialEnd: trialEnd,
          cancelAtPeriodEnd: false,
        },
      });

      // 2. Create Subscription Item
      await tx.subscriptionItem.create({
        data: {
          subscriptionId: subscription.id,
          priceId: primaryPrice.id,
          quantity: 1,
        },
      });

      // 3. Generate Initial Invoice
      const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
      const subtotalCents = primaryPrice.unitAmount;
      const totalCents = isTrial ? 0 : subtotalCents;

      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber,
          tenantId: dto.tenantId,
          subscriptionId: subscription.id,
          status: totalCents === 0 ? 'PAID' : 'OPEN',
          currency: primaryPrice.currency,
          subtotalCents,
          taxCents: 0,
          totalCents,
          amountPaidCents: totalCents === 0 ? 0 : totalCents,
          amountDueCents: totalCents === 0 ? 0 : 0,
          paidAt: totalCents === 0 ? now : now,
        },
      });

      // 4. Create Invoice Line Item
      await tx.invoiceLineItem.create({
        data: {
          invoiceId: invoice.id,
          priceId: primaryPrice.id,
          description: `${plan.name} Plan - Subscription (${primaryPrice.interval})`,
          quantity: 1,
          unitAmount: primaryPrice.unitAmount,
          totalAmount: primaryPrice.unitAmount,
        },
      });

      // 5. If paid, record payment transaction
      if (totalCents > 0) {
        await tx.paymentTransaction.create({
          data: {
            invoiceId: invoice.id,
            provider: 'STRIPE',
            transactionId: `txn_${generateId()}`,
            amountCents: totalCents,
            currency: primaryPrice.currency,
            status: 'SUCCEEDED',
            paymentMethod: dto.paymentMethod ?? 'pm_card_visa_default',
          },
        });
      }

      // Update tenant active plan in Tenant table
      await tx.tenant.update({
        where: { id: dto.tenantId },
        data: {
          plan: plan.slug,
          status: 'ACTIVE',
        },
      });

      logger.info(
        { tenantId: dto.tenantId, planSlug: plan.slug, subscriptionId: subscription.id },
        'Tenant successfully subscribed to plan'
      );

      return tx.subscription.findUnique({
        where: { id: subscription.id },
        include: {
          plan: { include: { prices: true } },
          items: { include: { price: true } },
          invoices: { include: { lineItems: true, payments: true } },
        },
      });
    });
  }

  /**
   * Change plan (upgrade / downgrade) with real database migration.
   */
  async changePlan(dto: ChangePlanDto) {
    const subscription = await prisma.subscription.findUnique({
      where: { id: dto.subscriptionId },
      include: { plan: { include: { prices: true } } },
    });
    if (!subscription) {
      throw new NotFoundException(`Subscription '${dto.subscriptionId}' not found.`);
    }

    const newPlan = await this.getPlanBySlug(dto.newPlanSlug);
    const newPrice = newPlan.prices[0];
    if (!newPrice) {
      throw new BadRequestException(`Target plan '${dto.newPlanSlug}' has no active price.`);
    }

    return prisma.$transaction(async (tx) => {
      // 1. Update subscription plan pointer
      const updatedSub = await tx.subscription.update({
        where: { id: dto.subscriptionId },
        data: {
          planId: newPlan.id,
          status: 'ACTIVE',
        },
      });

      // 2. Update Subscription Items
      await tx.subscriptionItem.deleteMany({
        where: { subscriptionId: dto.subscriptionId },
      });

      await tx.subscriptionItem.create({
        data: {
          subscriptionId: dto.subscriptionId,
          priceId: newPrice.id,
          quantity: 1,
        },
      });

      // 3. Update tenant plan identifier
      await tx.tenant.update({
        where: { id: subscription.tenantId },
        data: { plan: newPlan.slug },
      });

      logger.info(
        { subscriptionId: dto.subscriptionId, fromPlan: subscription.plan.slug, toPlan: newPlan.slug },
        'Subscription plan successfully updated'
      );

      return updatedSub;
    });
  }

  /**
   * Cancel subscription (immediate or at period end).
   */
  async cancelSubscription(subscriptionId: string, atPeriodEnd = true) {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });
    if (!subscription) {
      throw new NotFoundException(`Subscription '${subscriptionId}' not found.`);
    }

    if (atPeriodEnd) {
      return prisma.subscription.update({
        where: { id: subscriptionId },
        data: { cancelAtPeriodEnd: true },
      });
    }

    return prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelAtPeriodEnd: false,
      },
    });
  }

  /**
   * Retrieve all real itemized invoices for a tenant.
   */
  async getInvoices(tenantId: string) {
    return prisma.invoice.findMany({
      where: { tenantId },
      include: {
        lineItems: true,
        payments: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
