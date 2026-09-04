import { createHash } from 'node:crypto';
import {
  ApActionPolicyDefinitionSchema,
  ApMatchRuleDefinitionSchema,
  type CreateApRuleDto,
  type PublishApRuleVersionDto,
} from '@gigalibs/contracts';
import { type Prisma, prisma } from '@gigalibs/db';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { runtimeConfig } from './config/runtime-config.js';
import { canonicalJson } from './operational-json.js';
import { resolveTenantId } from './tenant-resolver.js';

export const AP_RULE_KINDS = ['AP_THREE_WAY_MATCH', 'AP_ACTION_POLICY'] as const;
export type ApRuleKind = (typeof AP_RULE_KINDS)[number];

@Injectable()
export class ApPolicyService {
  async listRules(tenantId: string) {
    const resolvedTenantId = await resolveTenantId(tenantId);
    return prisma.ruleDefinition.findMany({
      where: { tenantId: resolvedTenantId, kind: { in: [...AP_RULE_KINDS] } },
      include: {
        versions: { orderBy: { version: 'desc' }, take: 10 },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createRule(tenantId: string, userId: string, dto: CreateApRuleDto) {
    const resolvedTenantId = await resolveTenantId(tenantId);
    try {
      return await prisma.$transaction(async (transaction) => {
        const rule = await transaction.ruleDefinition.create({
          data: {
            tenantId: resolvedTenantId,
            name: dto.name,
            description: dto.description ?? null,
            kind: dto.kind,
            conditionAst: {},
            actionPayload: {},
            isActive: false,
          },
        });
        await transaction.auditLog.create({
          data: {
            tenantId: resolvedTenantId,
            userId,
            action: 'CREATE',
            resource: 'ap-rule',
            resourceId: rule.id,
            after: { name: rule.name, kind: rule.kind, active: false },
          },
        });
        return rule;
      });
    } catch (error) {
      if (this.isUniqueConstraint(error)) {
        throw new ConflictException(`Rule name '${dto.name}' already exists.`);
      }
      throw error;
    }
  }

  async publishRule(
    tenantId: string,
    userId: string,
    ruleId: string,
    dto: PublishApRuleVersionDto,
  ) {
    const resolvedTenantId = await resolveTenantId(tenantId);
    const existing = await prisma.ruleDefinition.findFirst({
      where: { id: ruleId, tenantId: resolvedTenantId, kind: { in: [...AP_RULE_KINDS] } },
    });
    if (!existing) throw new NotFoundException(`AP rule '${ruleId}' was not found.`);
    const definition = this.validateDefinition(existing.kind as ApRuleKind, dto.definition);
    const checksum = createHash('sha256').update(canonicalJson(definition)).digest('hex');

    return this.withSerializableRetry(() =>
      prisma.$transaction(
        async (transaction) => {
          const rule = await transaction.ruleDefinition.findFirst({
            where: { id: ruleId, tenantId: resolvedTenantId },
          });
          if (!rule) throw new NotFoundException(`AP rule '${ruleId}' was not found.`);
          const duplicate = await transaction.ruleVersion.findUnique({
            where: { ruleId_checksum: { ruleId, checksum } },
          });
          if (duplicate) return duplicate;
          const latest = await transaction.ruleVersion.findFirst({
            where: { ruleId },
            orderBy: { version: 'desc' },
            select: { version: true },
          });
          const version = (latest?.version ?? 0) + 1;
          await transaction.ruleDefinition.updateMany({
            where: {
              tenantId: resolvedTenantId,
              kind: rule.kind,
              isActive: true,
              id: { not: ruleId },
            },
            data: { isActive: false },
          });
          const published = await transaction.ruleVersion.create({
            data: {
              tenantId: resolvedTenantId,
              ruleId,
              version,
              definition: definition as Prisma.InputJsonValue,
              checksum,
              publishedById: userId,
            },
          });
          await transaction.ruleDefinition.update({
            where: { id: ruleId },
            data: {
              isActive: true,
              activeVersion: version,
              conditionAst: definition as Prisma.InputJsonValue,
            },
          });
          await transaction.auditLog.create({
            data: {
              tenantId: resolvedTenantId,
              userId,
              action: 'UPDATE',
              resource: 'ap-rule-version',
              resourceId: published.id,
              after: { ruleId, kind: rule.kind, version, checksum },
            },
          });
          return published;
        },
        { isolationLevel: 'Serializable' },
      ),
    );
  }

  async getActiveRule(tenantId: string, kind: ApRuleKind) {
    const rule = await prisma.ruleDefinition.findFirst({
      where: { tenantId, kind, isActive: true, activeVersion: { not: null } },
      orderBy: { updatedAt: 'desc' },
    });
    if (!rule || rule.activeVersion === null) {
      throw new ConflictException(`An active ${kind} policy is required.`);
    }
    const version = await prisma.ruleVersion.findUnique({
      where: { ruleId_version: { ruleId: rule.id, version: rule.activeVersion } },
    });
    if (!version) throw new ConflictException(`The active ${kind} policy version is unavailable.`);
    return { rule, version };
  }

  private validateDefinition(kind: ApRuleKind, definition: unknown) {
    const result =
      kind === 'AP_THREE_WAY_MATCH'
        ? ApMatchRuleDefinitionSchema.safeParse(definition)
        : ApActionPolicyDefinitionSchema.safeParse(definition);
    if (!result.success) {
      throw new BadRequestException({
        message: `The ${kind} definition is invalid.`,
        issues: result.error.issues,
      });
    }
    return result.data;
  }

  private isUniqueConstraint(error: unknown): boolean {
    return !!error && typeof error === 'object' && 'code' in error && error.code === 'P2002';
  }

  private async withSerializableRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= runtimeConfig.workflowPublishMaxRetries; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        const retryable =
          !!error &&
          typeof error === 'object' &&
          'code' in error &&
          ['P2034', 'P2002'].includes(String(error.code));
        if (!retryable || attempt === runtimeConfig.workflowPublishMaxRetries) throw error;
      }
    }
    throw lastError;
  }
}
