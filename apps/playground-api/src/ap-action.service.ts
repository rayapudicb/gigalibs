import { createHash } from 'node:crypto';
import {
  ApActionPolicyDefinitionSchema,
  type DecideBusinessActionDto,
  type ListBusinessActionsDto,
  type ListSupplierInvoicesDto,
} from '@gigalibs/contracts';
import { type Prisma, prisma } from '@gigalibs/db';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { runtimeConfig } from './config/runtime-config.js';
import { canonicalJson } from './operational-json.js';
import { resolveTenantId } from './tenant-resolver.js';
// biome-ignore lint/style/useImportType: NestJS needs the runtime constructor token for dependency injection.
import { ValueLedgerService } from './value-ledger.service.js';

const actionDecisionInclude = {
  supplierInvoice: true,
  policyRuleVersion: true,
  approvals: true,
  result: true,
} satisfies Prisma.BusinessActionInclude;

type ActionForDecision = Prisma.BusinessActionGetPayload<{
  include: typeof actionDecisionInclude;
}>;

@Injectable()
export class ApActionService {
  constructor(private readonly valueLedger: ValueLedgerService) {}

  async listInvoices(tenantId: string, query: ListSupplierInvoicesDto) {
    const resolvedTenantId = await resolveTenantId(tenantId);
    const records = await prisma.supplierInvoice.findMany({
      where: {
        tenantId: resolvedTenantId,
        ...(query.environmentId ? { environmentId: query.environmentId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      include: {
        sourceEvent: {
          select: {
            eventId: true,
            eventType: true,
            eventVersion: true,
            classification: true,
          },
        },
        supplier: { select: { externalId: true, name: true } },
        purchaseOrder: { select: { externalId: true } },
        matchEvaluations: {
          select: { id: true, outcome: true, explanation: true, evaluatedAt: true },
          orderBy: { evaluatedAt: 'desc' },
          take: 1,
        },
        actions: {
          select: { id: true, actionType: true, status: true, risk: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      take: query.limit + 1,
    });
    return this.page(records, query.limit);
  }

  async getInvoice(tenantId: string, invoiceId: string) {
    const resolvedTenantId = await resolveTenantId(tenantId);
    const invoice = await prisma.supplierInvoice.findFirst({
      where: { id: invoiceId, tenantId: resolvedTenantId },
      include: {
        supplier: true,
        purchaseOrder: {
          include: { supplier: true, lines: true, goodsReceipts: { include: { lines: true } } },
        },
        lines: { orderBy: { lineNumber: 'asc' } },
        sourceEvent: {
          select: {
            eventId: true,
            eventType: true,
            eventVersion: true,
            correlationId: true,
            classification: true,
            payloadHash: true,
            status: true,
            receivedAt: true,
            processedAt: true,
          },
        },
        matchEvaluations: {
          include: {
            ruleVersion: { select: { id: true, version: true, checksum: true } },
            findings: true,
            evidenceBundle: { include: { items: true } },
          },
          orderBy: { evaluatedAt: 'desc' },
          take: 20,
        },
        actions: {
          include: { approvals: { orderBy: { decidedAt: 'asc' } }, result: true },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });
    if (!invoice) throw new NotFoundException(`Supplier invoice '${invoiceId}' was not found.`);
    return this.jsonSafe(invoice);
  }

  async listActions(tenantId: string, query: ListBusinessActionsDto) {
    const resolvedTenantId = await resolveTenantId(tenantId);
    const records = await prisma.businessAction.findMany({
      where: {
        tenantId: resolvedTenantId,
        ...(query.environmentId ? { environmentId: query.environmentId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      include: {
        supplierInvoice: {
          select: {
            id: true,
            invoiceNumber: true,
            totalMinor: true,
            currency: true,
            status: true,
            supplier: { select: { name: true, externalId: true } },
          },
        },
        approvals: { select: { approverId: true, decision: true, decidedAt: true } },
        result: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      take: query.limit + 1,
    });
    return this.page(records, query.limit);
  }

  async getAction(tenantId: string, actionId: string) {
    const resolvedTenantId = await resolveTenantId(tenantId);
    const action = await this.loadAction(resolvedTenantId, actionId);
    if (!action) throw new NotFoundException(`Business action '${actionId}' was not found.`);
    return this.jsonSafe(action);
  }

  approve(tenantId: string, userId: string, actionId: string, dto: DecideBusinessActionDto) {
    return this.decide(tenantId, userId, actionId, 'APPROVED', dto);
  }

  reject(tenantId: string, userId: string, actionId: string, dto: DecideBusinessActionDto) {
    return this.decide(tenantId, userId, actionId, 'REJECTED', dto);
  }

  private async decide(
    tenantId: string,
    userId: string,
    actionId: string,
    decision: 'APPROVED' | 'REJECTED',
    dto: DecideBusinessActionDto,
  ) {
    const resolvedTenantId = await resolveTenantId(tenantId);
    const membership = await prisma.tenantMember.findUnique({
      where: { userId_tenantId: { userId, tenantId: resolvedTenantId } },
    });
    if (!membership || membership.status !== 'ACTIVE') {
      throw new ForbiddenException('An active tenant membership is required.');
    }

    await this.withSerializableRetry(() =>
      prisma.$transaction(
        async (transaction) => {
          const action = await transaction.businessAction.findFirst({
            where: { id: actionId, tenantId: resolvedTenantId },
            include: actionDecisionInclude,
          });
          if (!action) throw new NotFoundException(`Business action '${actionId}' was not found.`);
          const existing = action.approvals.find((approval) => approval.approverId === userId);
          if (existing) {
            if (existing.decision === decision && existing.reason === dto.reason) return;
            throw new ConflictException('This user has already decided the action.');
          }
          if (action.status !== 'PENDING_APPROVAL') {
            throw new ConflictException(`Action cannot be decided from status ${action.status}.`);
          }
          if (action.actionType !== 'AP_APPROVE_FOR_PAYMENT') {
            throw new ConflictException(`Action type '${action.actionType}' is not executable.`);
          }
          const policy = ApActionPolicyDefinitionSchema.parse(action.policyRuleVersion.definition);
          if (!policy.approverRoles.includes(membership.role as 'TENANT_ADMIN' | 'MANAGER')) {
            throw new ForbiddenException(
              'The active policy does not authorize this membership role.',
            );
          }
          if (policy.prohibitSelfApproval && action.requestedById === userId) {
            throw new ForbiddenException('The action policy prohibits self-approval.');
          }
          if (
            BigInt(action.supplierInvoice.totalMinor.toString()) > BigInt(policy.maxAmountMinor)
          ) {
            throw new ConflictException('The action amount exceeds the immutable policy limit.');
          }

          await transaction.actionApproval.create({
            data: {
              tenantId: resolvedTenantId,
              actionId,
              approverId: userId,
              decision,
              reason: dto.reason,
              evidence: {
                membershipRole: membership.role,
                policyRuleVersionId: action.policyRuleVersionId,
                policyChecksum: action.policyRuleVersion.checksum,
                actionInputHash: action.inputHash,
              },
            },
          });

          if (decision === 'REJECTED') {
            await transaction.businessAction.update({
              where: { id: actionId },
              data: { status: 'REJECTED', rejectedAt: new Date() },
            });
            await transaction.supplierInvoice.update({
              where: { id: action.supplierInvoiceId },
              data: { status: 'REJECTED' },
            });
          } else {
            const approvalCount =
              action.approvals.filter((approval) => approval.decision === 'APPROVED').length + 1;
            if (approvalCount >= action.requiredApprovals) {
              await this.executeApprovedAction(transaction, action, policy, userId);
            }
          }

          await transaction.auditLog.create({
            data: {
              tenantId: resolvedTenantId,
              userId,
              action: 'STATUS_CHANGE',
              resource: 'business-action-approval',
              resourceId: actionId,
              after: {
                decision,
                reason: dto.reason,
                membershipRole: membership.role,
                policyRuleVersionId: action.policyRuleVersionId,
              },
            },
          });
        },
        { isolationLevel: 'Serializable' },
      ),
    );
    return this.getAction(resolvedTenantId, actionId);
  }

  private async executeApprovedAction(
    transaction: Prisma.TransactionClient,
    action: ActionForDecision,
    policy: ReturnType<typeof ApActionPolicyDefinitionSchema.parse>,
    approvingUserId: string,
  ) {
    if (action.result) return;
    const executedAt = new Date();
    const before = {
      supplierInvoiceId: action.supplierInvoice.id,
      status: action.supplierInvoice.status,
      totalMinor: action.supplierInvoice.totalMinor.toString(),
      currency: action.supplierInvoice.currency,
    };
    const after = { ...before, status: 'APPROVED_FOR_PAYMENT' };
    const beforeHash = createHash('sha256').update(canonicalJson(before)).digest('hex');
    const afterHash = createHash('sha256').update(canonicalJson(after)).digest('hex');

    await transaction.supplierInvoice.update({
      where: { id: action.supplierInvoiceId },
      data: { status: 'APPROVED_FOR_PAYMENT' },
    });
    await transaction.businessAction.update({
      where: { id: action.id },
      data: {
        status: 'SUCCEEDED',
        approvedAt: executedAt,
        executedAt,
      },
    });
    await transaction.actionResult.create({
      data: {
        tenantId: action.tenantId,
        actionId: action.id,
        status: 'SUCCEEDED',
        result: {
          effect: 'SUPPLIER_INVOICE_STATUS_TRANSITION',
          supplierInvoiceId: action.supplierInvoiceId,
          previousStatus: action.supplierInvoice.status,
          currentStatus: 'APPROVED_FOR_PAYMENT',
          executedByApprovalUserId: approvingUserId,
          policyRuleVersionId: action.policyRuleVersionId,
        },
        beforeHash,
        afterHash,
        executedAt,
      },
    });
    await this.valueLedger.recordApprovedAction(transaction, action, policy, executedAt);
    await transaction.auditLog.create({
      data: {
        tenantId: action.tenantId,
        userId: approvingUserId,
        action: 'UPDATE',
        resource: 'supplier-invoice-payment-approval',
        resourceId: action.supplierInvoiceId,
        before,
        after: { ...after, actionId: action.id, beforeHash, afterHash },
      },
    });
  }

  private loadAction(tenantId: string, actionId: string) {
    return prisma.businessAction.findFirst({
      where: { id: actionId, tenantId },
      include: {
        supplierInvoice: { include: { supplier: true } },
        policyRuleVersion: { include: { rule: { select: { id: true, name: true, kind: true } } } },
        approvals: { orderBy: { decidedAt: 'asc' } },
        result: true,
      },
    });
  }

  private page<T extends { id: string }>(records: T[], limit: number) {
    const hasNextPage = records.length > limit;
    const items = hasNextPage ? records.slice(0, limit) : records;
    return this.jsonSafe({
      items,
      nextCursor: hasNextPage ? (items.at(-1)?.id ?? null) : null,
    });
  }

  private jsonSafe<T>(value: T): T {
    return JSON.parse(
      JSON.stringify(value, (_key, child) =>
        typeof child === 'bigint' ? child.toString() : child,
      ),
    ) as T;
  }

  private async withSerializableRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= runtimeConfig.workflowPublishMaxRetries; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        const retryable =
          !!error && typeof error === 'object' && 'code' in error && error.code === 'P2034';
        if (!retryable || attempt === runtimeConfig.workflowPublishMaxRetries) throw error;
      }
    }
    throw lastError;
  }
}
