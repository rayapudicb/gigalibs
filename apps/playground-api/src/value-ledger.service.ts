import { createHash } from 'node:crypto';
import type {
  ApActionPolicyDefinition,
  ApProcessingValueAssumptions,
  CreateValueDefinitionDto,
  DecideValueEventDto,
  ListValueDefinitionsDto,
  ListValueEventsDto,
  PublishValueDefinitionDto,
  ValueReportQueryDto,
} from '@gigalibs/contracts';
import {
  ApProcessingValueAssumptionsSchema,
  PublishValueDefinitionSchema,
  ValueBaselineSchema,
  ValueTargetSchema,
} from '@gigalibs/contracts';
import { Prisma, prisma } from '@gigalibs/db';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { runtimeConfig } from './config/runtime-config.js';
import { canonicalJson } from './operational-json.js';
import { resolveTenantId } from './tenant-resolver.js';

interface ApprovedActionForValue {
  id: string;
  tenantId: string;
  environmentId: string;
  policyRuleVersionId: string;
  inputHash: string;
  supplierInvoice: {
    id: string;
    sourceEventId: string;
    totalMinor: bigint;
    currency: string;
  };
}

@Injectable()
export class ValueLedgerService {
  async createDefinition(tenantId: string, userId: string, dto: CreateValueDefinitionDto) {
    const resolvedTenantId = await resolveTenantId(tenantId);
    const environment = await prisma.tenantEnvironment.findFirst({
      where: { id: dto.environmentId, tenantId: resolvedTenantId },
      select: { id: true },
    });
    if (!environment) throw new NotFoundException('The tenant environment was not found.');
    try {
      return await prisma.$transaction(async (transaction) => {
        const definition = await transaction.valueDefinition.create({
          data: {
            tenantId: resolvedTenantId,
            environmentId: dto.environmentId,
            outcomeKey: dto.outcomeKey,
            name: dto.name,
            description: dto.description ?? null,
            currency: dto.currency,
            classification: dto.classification,
            createdById: userId,
          },
        });
        await transaction.auditLog.create({
          data: {
            tenantId: resolvedTenantId,
            userId,
            action: 'CREATE',
            resource: 'value-definition',
            resourceId: definition.id,
            after: {
              environmentId: definition.environmentId,
              outcomeKey: definition.outcomeKey,
              currency: definition.currency,
              classification: definition.classification,
            },
          },
        });
        return definition;
      });
    } catch (error) {
      if (this.isUniqueConstraint(error)) {
        throw new ConflictException(
          `Value outcome '${dto.outcomeKey}' already exists in this environment.`,
        );
      }
      throw error;
    }
  }

  async listDefinitions(tenantId: string, query: ListValueDefinitionsDto) {
    const resolvedTenantId = await resolveTenantId(tenantId);
    const records = await prisma.valueDefinition.findMany({
      where: {
        tenantId: resolvedTenantId,
        ...(query.environmentId ? { environmentId: query.environmentId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      include: {
        environment: { select: { slug: true, displayName: true } },
        versions: { orderBy: { version: 'desc' }, take: 1 },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      take: query.limit + 1,
    });
    return this.page(records, query.limit);
  }

  async getDefinition(tenantId: string, definitionId: string) {
    const resolvedTenantId = await resolveTenantId(tenantId);
    const definition = await prisma.valueDefinition.findFirst({
      where: { id: definitionId, tenantId: resolvedTenantId },
      include: {
        environment: { select: { id: true, slug: true, displayName: true, kind: true } },
        versions: { orderBy: { version: 'desc' } },
      },
    });
    if (!definition)
      throw new NotFoundException(`Value definition '${definitionId}' was not found.`);
    return this.jsonSafe(definition);
  }

  async publishDefinition(
    tenantId: string,
    userId: string,
    definitionId: string,
    input: PublishValueDefinitionDto,
  ) {
    const resolvedTenantId = await resolveTenantId(tenantId);
    const dto = PublishValueDefinitionSchema.parse(input);
    const checksum = createHash('sha256').update(canonicalJson(dto)).digest('hex');
    await this.withSerializableRetry(() =>
      prisma.$transaction(
        async (transaction) => {
          const definition = await transaction.valueDefinition.findFirst({
            where: { id: definitionId, tenantId: resolvedTenantId },
            include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
          });
          if (!definition) {
            throw new NotFoundException(`Value definition '${definitionId}' was not found.`);
          }
          const identical = await transaction.valueDefinitionVersion.findUnique({
            where: { valueDefinitionId_checksum: { valueDefinitionId: definition.id, checksum } },
          });
          if (identical) {
            await transaction.valueDefinition.update({
              where: { id: definition.id },
              data: { status: 'ACTIVE', currentVersion: identical.version },
            });
            return;
          }
          const versionNumber = (definition.versions[0]?.version ?? 0) + 1;
          await transaction.valueDefinitionVersion.create({
            data: {
              tenantId: resolvedTenantId,
              valueDefinitionId: definition.id,
              version: versionNumber,
              formulaKind: dto.formulaKind,
              assumptions: dto.assumptions,
              baseline: dto.baseline,
              target: dto.target,
              checksum,
              publishedById: userId,
            },
          });
          await transaction.valueDefinition.update({
            where: { id: definition.id },
            data: { status: 'ACTIVE', currentVersion: versionNumber },
          });
          await transaction.auditLog.create({
            data: {
              tenantId: resolvedTenantId,
              userId,
              action: 'STATUS_CHANGE',
              resource: 'value-definition-version',
              resourceId: definition.id,
              after: {
                version: versionNumber,
                checksum,
                formulaKind: dto.formulaKind,
                status: 'ACTIVE',
              },
            },
          });
        },
        { isolationLevel: 'Serializable' },
      ),
    );
    return this.getDefinition(resolvedTenantId, definitionId);
  }

  async listEvents(tenantId: string, query: ListValueEventsDto) {
    const resolvedTenantId = await resolveTenantId(tenantId);
    const records = await prisma.valueEvent.findMany({
      where: {
        tenantId: resolvedTenantId,
        ...(query.environmentId ? { environmentId: query.environmentId } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.valueDefinitionId
          ? { valueDefinitionVersion: { valueDefinitionId: query.valueDefinitionId } }
          : {}),
      },
      include: {
        valueDefinitionVersion: {
          include: { valueDefinition: { select: { id: true, outcomeKey: true, name: true } } },
        },
        businessAction: { select: { id: true, actionType: true, status: true } },
        approvals: { orderBy: { decidedAt: 'asc' } },
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      take: query.limit + 1,
    });
    return this.page(records, query.limit);
  }

  async getEvent(tenantId: string, eventId: string) {
    const resolvedTenantId = await resolveTenantId(tenantId);
    const event = await prisma.valueEvent.findFirst({
      where: { id: eventId, tenantId: resolvedTenantId },
      include: {
        valueDefinitionVersion: { include: { valueDefinition: true } },
        sourceEvent: {
          select: { id: true, eventId: true, correlationId: true, payloadHash: true, status: true },
        },
        businessAction: {
          include: {
            supplierInvoice: {
              select: { id: true, invoiceNumber: true, totalMinor: true, currency: true },
            },
            result: true,
          },
        },
        approvals: { orderBy: { decidedAt: 'asc' } },
      },
    });
    if (!event) throw new NotFoundException(`Value event '${eventId}' was not found.`);
    return this.jsonSafe(event);
  }

  verify(tenantId: string, userId: string, eventId: string, dto: DecideValueEventDto) {
    return this.decideEvent(tenantId, userId, eventId, 'VERIFIED', dto);
  }

  reject(tenantId: string, userId: string, eventId: string, dto: DecideValueEventDto) {
    return this.decideEvent(tenantId, userId, eventId, 'REJECTED', dto);
  }

  async report(tenantId: string, query: ValueReportQueryDto) {
    const resolvedTenantId = await resolveTenantId(tenantId);
    const rows = await prisma.valueEvent.groupBy({
      by: ['status', 'currency', 'valueDefinitionVersionId'],
      where: {
        tenantId: resolvedTenantId,
        ...(query.environmentId ? { environmentId: query.environmentId } : {}),
        ...(query.occurredFrom || query.occurredTo
          ? {
              occurredAt: {
                ...(query.occurredFrom ? { gte: new Date(query.occurredFrom) } : {}),
                ...(query.occurredTo ? { lte: new Date(query.occurredTo) } : {}),
              },
            }
          : {}),
      },
      _count: { _all: true },
      _sum: { grossValueMinor: true, allocatedCostMinor: true, netValueMinor: true },
      orderBy: [{ currency: 'asc' }, { valueDefinitionVersionId: 'asc' }, { status: 'asc' }],
    });
    const versions = await prisma.valueDefinitionVersion.findMany({
      where: {
        tenantId: resolvedTenantId,
        id: { in: rows.map((row) => row.valueDefinitionVersionId) },
      },
      include: { valueDefinition: { select: { id: true, outcomeKey: true, name: true } } },
    });
    const byVersion = new Map(versions.map((version) => [version.id, version]));
    return this.jsonSafe({
      scope: {
        environmentId: query.environmentId ?? null,
        occurredFrom: query.occurredFrom ?? null,
        occurredTo: query.occurredTo ?? null,
      },
      basis: {
        verified: 'Only independently approved value events are recognized.',
        calculated: 'Calculated events remain pending and are excluded from verified totals.',
        rejected: 'Rejected value events are retained for audit and excluded from claims.',
      },
      rows: rows.map((row) => {
        const version = byVersion.get(row.valueDefinitionVersionId);
        return {
          status: row.status,
          currency: row.currency,
          eventCount: row._count._all,
          grossValueMinor: row._sum.grossValueMinor ?? 0n,
          allocatedCostMinor: row._sum.allocatedCostMinor ?? 0n,
          netValueMinor: row._sum.netValueMinor ?? 0n,
          definition: version
            ? {
                id: version.valueDefinition.id,
                outcomeKey: version.valueDefinition.outcomeKey,
                name: version.valueDefinition.name,
                version: version.version,
                formulaKind: version.formulaKind,
                checksum: version.checksum,
              }
            : null,
        };
      }),
    });
  }

  async recordApprovedAction(
    transaction: Prisma.TransactionClient,
    action: ApprovedActionForValue,
    policy: ApActionPolicyDefinition,
    occurredAt: Date,
  ) {
    if (!policy.valueOutcomeKey) return null;
    const definition = await transaction.valueDefinition.findFirst({
      where: {
        tenantId: action.tenantId,
        environmentId: action.environmentId,
        outcomeKey: policy.valueOutcomeKey,
        status: 'ACTIVE',
        currentVersion: { not: null },
      },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    });
    const version = definition?.versions[0];
    if (!definition || !version || version.version !== definition.currentVersion) {
      throw new ConflictException(
        `No active value definition is published for outcome '${policy.valueOutcomeKey}'.`,
      );
    }
    if (definition.currency !== action.supplierInvoice.currency) {
      throw new ConflictException('The value definition currency does not match the invoice.');
    }
    if (version.formulaKind !== 'AP_PROCESSING_COST_AVOIDED') {
      throw new ConflictException(`Unsupported value formula '${version.formulaKind}'.`);
    }
    const assumptions = ApProcessingValueAssumptionsSchema.parse(version.assumptions);
    const baseline = ValueBaselineSchema.parse(version.baseline);
    const target = ValueTargetSchema.parse(version.target);
    const result = this.calculateApValue(assumptions, baseline.monthlyCaseVolume);
    const sourceEvent = await transaction.sourceEvent.findUnique({
      where: { id: action.supplierInvoice.sourceEventId },
      select: { classification: true },
    });
    if (!sourceEvent) throw new ConflictException('The value source event was not found.');
    const evaluation = await transaction.apMatchEvaluation.findFirst({
      where: { supplierInvoiceId: action.supplierInvoice.id, tenantId: action.tenantId },
      include: { evidenceBundle: { select: { id: true, contentHash: true } } },
      orderBy: { evaluatedAt: 'desc' },
    });
    return transaction.valueEvent.create({
      data: {
        tenantId: action.tenantId,
        environmentId: action.environmentId,
        valueDefinitionVersionId: version.id,
        sourceEventId: action.supplierInvoice.sourceEventId,
        businessActionId: action.id,
        eventType: 'AP_INVOICE_APPROVED_FOR_PAYMENT',
        quantity: new Prisma.Decimal(1),
        currency: definition.currency,
        classification: this.highestClassification(
          definition.classification,
          sourceEvent.classification,
        ),
        grossValueMinor: result.grossValueMinor,
        allocatedCostMinor: result.allocatedCostMinor,
        netValueMinor: result.netValueMinor,
        calculation: {
          formulaKind: version.formulaKind,
          formulaVersion: version.version,
          formulaChecksum: version.checksum,
          assumptions,
          baseline,
          target,
          method: {
            gross: '(manualMinutesPerCase - automatedMinutesPerCase) * loadedHourlyCostMinor / 60',
            allocatedCost:
              '(monthlyPlatformCostMinor + monthlyIntegrationOperatingCostMinor) / monthlyCaseVolume + humanReviewMinutesPerCase * loadedHourlyCostMinor / 60',
            net: 'grossValueMinor - allocatedCostMinor',
            rounding: 'nearest minor currency unit, half up',
          },
        },
        evidence: {
          businessActionId: action.id,
          actionInputHash: action.inputHash,
          policyRuleVersionId: action.policyRuleVersionId,
          supplierInvoiceId: action.supplierInvoice.id,
          supplierInvoiceTotalMinor: action.supplierInvoice.totalMinor.toString(),
          sourceEventId: action.supplierInvoice.sourceEventId,
          matchEvaluationId: evaluation?.id ?? null,
          evidenceBundleId: evaluation?.evidenceBundle?.id ?? null,
          evidenceBundleHash: evaluation?.evidenceBundle?.contentHash ?? null,
          baselineEvidenceReference: baseline.evidenceReference,
        },
        status: 'CALCULATED',
        occurredAt,
      },
    });
  }

  private async decideEvent(
    tenantId: string,
    userId: string,
    eventId: string,
    decision: 'VERIFIED' | 'REJECTED',
    dto: DecideValueEventDto,
  ) {
    const resolvedTenantId = await resolveTenantId(tenantId);
    const member = await prisma.tenantMember.findUnique({
      where: { userId_tenantId: { userId, tenantId: resolvedTenantId } },
    });
    if (!member || member.status !== 'ACTIVE') {
      throw new ForbiddenException('An active tenant membership is required.');
    }
    await this.withSerializableRetry(() =>
      prisma.$transaction(
        async (transaction) => {
          const event = await transaction.valueEvent.findFirst({
            where: { id: eventId, tenantId: resolvedTenantId },
            include: {
              approvals: true,
              valueDefinitionVersion: true,
              businessAction: {
                select: {
                  approvals: {
                    where: { decision: 'APPROVED' },
                    select: { approverId: true },
                  },
                },
              },
            },
          });
          if (!event) throw new NotFoundException(`Value event '${eventId}' was not found.`);
          const existing = event.approvals.find((approval) => approval.approverId === userId);
          if (existing) {
            if (existing.decision === decision && existing.reason === dto.reason) return;
            throw new ConflictException('This user has already decided the value event.');
          }
          if (event.status !== 'CALCULATED') {
            throw new ConflictException(
              `Value event cannot be decided from status ${event.status}.`,
            );
          }
          if (event.valueDefinitionVersion.publishedById === userId) {
            throw new ForbiddenException(
              'A formula publisher cannot independently verify value calculated by that formula.',
            );
          }
          if (event.businessAction?.approvals.some((approval) => approval.approverId === userId)) {
            throw new ForbiddenException(
              'A business-action approver cannot independently verify its derived value.',
            );
          }
          await transaction.benefitApproval.create({
            data: {
              tenantId: resolvedTenantId,
              valueEventId: event.id,
              approverId: userId,
              decision,
              reason: dto.reason,
              evidence: {
                membershipRole: member.role,
                formulaVersionId: event.valueDefinitionVersionId,
                formulaChecksum: event.valueDefinitionVersion.checksum,
                calculationHash: createHash('sha256')
                  .update(canonicalJson(event.calculation))
                  .digest('hex'),
              },
            },
          });
          await transaction.valueEvent.update({
            where: { id: event.id },
            data: { status: decision },
          });
          await transaction.auditLog.create({
            data: {
              tenantId: resolvedTenantId,
              userId,
              action: 'STATUS_CHANGE',
              resource: 'value-event-verification',
              resourceId: event.id,
              before: { status: event.status },
              after: { status: decision, reason: dto.reason, membershipRole: member.role },
            },
          });
        },
        { isolationLevel: 'Serializable' },
      ),
    );
    return this.getEvent(resolvedTenantId, eventId);
  }

  private calculateApValue(assumptions: ApProcessingValueAssumptions, monthlyCaseVolume: number) {
    const hourly = BigInt(assumptions.loadedHourlyCostMinor);
    const savedMinutes = BigInt(
      assumptions.manualMinutesPerCase - assumptions.automatedMinutesPerCase,
    );
    const grossValueMinor = this.roundDivide(savedMinutes * hourly, 60n);
    const recurringCosts =
      BigInt(assumptions.monthlyPlatformCostMinor) +
      BigInt(assumptions.monthlyIntegrationOperatingCostMinor);
    const recurringCostPerCase = this.roundDivide(recurringCosts, BigInt(monthlyCaseVolume));
    const reviewCost = this.roundDivide(
      BigInt(assumptions.humanReviewMinutesPerCase) * hourly,
      60n,
    );
    const allocatedCostMinor = recurringCostPerCase + reviewCost;
    return {
      grossValueMinor,
      allocatedCostMinor,
      netValueMinor: grossValueMinor - allocatedCostMinor,
    };
  }

  private roundDivide(numerator: bigint, denominator: bigint) {
    return (numerator + denominator / 2n) / denominator;
  }

  private highestClassification(
    first: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED',
    second: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED',
  ) {
    const rank = {
      PUBLIC: 0,
      INTERNAL: 1,
      CONFIDENTIAL: 2,
      RESTRICTED: 3,
    } as const;
    return rank[first] >= rank[second] ? first : second;
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

  private isUniqueConstraint(error: unknown) {
    return !!error && typeof error === 'object' && 'code' in error && error.code === 'P2002';
  }
}
