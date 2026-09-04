import { createHash } from 'node:crypto'
import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import type {
  CreateWorkflowDto,
  PublishWorkflowDto,
  UpdateWorkflowDraftDto,
  WorkflowGraphDto,
} from '@gigalibs/contracts'
import { prisma, type Prisma } from '@gigalibs/db'
import { logger } from '@gigalibs/logger'
import { runtimeConfig } from './config/runtime-config.js'
import { resolveTenantId } from './tenant-resolver.js'

interface GraphValidationReport extends Prisma.InputJsonObject {
  valid: true
  nodeCount: number
  edgeCount: number
  rootNodeId: string
}

@Injectable()
export class WorkflowService {
  async getPipelines(tenantId: string) {
    const resolvedTenantId = await resolveTenantId(tenantId)
    return prisma.workflowPipeline.findMany({
      where: { tenantId: resolvedTenantId },
      include: {
        versions: {
          orderBy: { version: 'desc' },
          take: 1,
          select: { id: true, version: true, checksum: true, publishedAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  async getPipeline(tenantId: string, pipelineId: string) {
    const resolvedTenantId = await resolveTenantId(tenantId)
    const pipeline = await prisma.workflowPipeline.findFirst({
      where: { id: pipelineId, tenantId: resolvedTenantId },
      include: {
        versions: {
          orderBy: { version: 'desc' },
          select: {
            id: true,
            version: true,
            checksum: true,
            schemaVersion: true,
            compilerVersion: true,
            publishedById: true,
            publishedAt: true,
          },
        },
      },
    })
    if (!pipeline) throw new NotFoundException(`Workflow '${pipelineId}' was not found.`)
    return pipeline
  }

  async createPipeline(tenantId: string, userId: string, dto: CreateWorkflowDto) {
    const resolvedTenantId = await resolveTenantId(tenantId)
    const report = this.validateGraph(dto.definition)
    this.assertNoEmbeddedSecrets(dto.definition)
    const pipeline = await prisma.$transaction(async (transaction) => {
      const created = await transaction.workflowPipeline.create({
        data: {
          tenantId: resolvedTenantId,
          name: dto.name,
          targetApp: dto.targetApp,
          description: dto.description ?? null,
          definition: dto.definition as Prisma.InputJsonValue,
          status: 'DRAFT',
          totalRuns: 0,
          successRate: 0,
        },
      })
      await transaction.auditLog.create({
        data: {
          action: 'CREATE',
          resource: 'workflow',
          resourceId: created.id,
          userId,
          tenantId: resolvedTenantId,
          after: {
            name: created.name,
            status: created.status,
            graph: report,
          },
        },
      })
      return created
    })
    logger.info({ pipelineId: pipeline.id, tenantId: resolvedTenantId }, 'Workflow draft created')
    return pipeline
  }

  async updateDraft(
    tenantId: string,
    userId: string,
    pipelineId: string,
    dto: UpdateWorkflowDraftDto,
  ) {
    const resolvedTenantId = await resolveTenantId(tenantId)
    const existing = await prisma.workflowPipeline.findFirst({
      where: { id: pipelineId, tenantId: resolvedTenantId },
    })
    if (!existing) throw new NotFoundException(`Workflow '${pipelineId}' was not found.`)
    if (existing.status !== 'DRAFT') {
      throw new ConflictException('Published workflows are immutable; create a new draft version.')
    }
    const report = this.validateGraph(dto.definition)
    this.assertNoEmbeddedSecrets(dto.definition)

    return prisma.$transaction(async (transaction) => {
      const updated = await transaction.workflowPipeline.update({
        where: { id: pipelineId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.targetApp !== undefined ? { targetApp: dto.targetApp } : {}),
          definition: dto.definition as Prisma.InputJsonValue,
        },
      })
      await transaction.auditLog.create({
        data: {
          action: 'UPDATE',
          resource: 'workflow-draft',
          resourceId: pipelineId,
          userId,
          tenantId: resolvedTenantId,
          before: { updatedAt: existing.updatedAt.toISOString() },
          after: {
            updatedAt: updated.updatedAt.toISOString(),
            graph: report,
          },
        },
      })
      return updated
    })
  }

  async publish(
    tenantId: string,
    userId: string,
    pipelineId: string,
    dto: PublishWorkflowDto,
  ) {
    const resolvedTenantId = await resolveTenantId(tenantId)
    const report = this.validateGraph(dto.definition)
    this.assertNoEmbeddedSecrets(dto.definition)
    const checksum = createHash('sha256')
      .update(this.canonicalJson(dto.definition))
      .digest('hex')

    const version = await this.withSerializableRetry(() => prisma.$transaction(async (transaction) => {
      const pipeline = await transaction.workflowPipeline.findFirst({
        where: { id: pipelineId, tenantId: resolvedTenantId },
      })
      if (!pipeline) throw new NotFoundException(`Workflow '${pipelineId}' was not found.`)

      const latest = await transaction.workflowVersion.findFirst({
        where: { pipelineId, tenantId: resolvedTenantId },
        orderBy: { version: 'desc' },
        select: { version: true },
      })
      const nextVersion = (latest?.version ?? 0) + 1
      const created = await transaction.workflowVersion.create({
        data: {
          pipelineId,
          tenantId: resolvedTenantId,
          version: nextVersion,
          definition: dto.definition as Prisma.InputJsonValue,
          inputSchema: dto.inputSchema as Prisma.InputJsonValue,
          outputSchema: dto.outputSchema as Prisma.InputJsonValue,
          checksum,
          schemaVersion: runtimeConfig.workflowSchemaVersion,
          compilerVersion: runtimeConfig.workflowCompilerVersion,
          validationReport: report as unknown as Prisma.InputJsonValue,
          publishedById: userId,
        },
      })
      await transaction.workflowPipeline.update({
        where: { id: pipelineId },
        data: {
          definition: dto.definition as Prisma.InputJsonValue,
          activeVersion: nextVersion,
          status: 'ACTIVE',
        },
      })
      await transaction.auditLog.create({
        data: {
          action: 'UPDATE',
          resource: 'workflow-version',
          resourceId: created.id,
          userId,
          tenantId: resolvedTenantId,
          after: {
            pipelineId,
            version: nextVersion,
            checksum,
            graph: report,
          },
        },
      })
      return created
    }, { isolationLevel: 'Serializable' }))

    logger.info(
      { pipelineId, tenantId: resolvedTenantId, version: version.version, checksum },
      'Workflow version published',
    )
    return version
  }

  async getVersions(tenantId: string, pipelineId: string) {
    const resolvedTenantId = await resolveTenantId(tenantId)
    const pipeline = await prisma.workflowPipeline.findFirst({
      where: { id: pipelineId, tenantId: resolvedTenantId },
      select: { id: true },
    })
    if (!pipeline) throw new NotFoundException(`Workflow '${pipelineId}' was not found.`)
    return prisma.workflowVersion.findMany({
      where: { pipelineId, tenantId: resolvedTenantId },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        version: true,
        checksum: true,
        schemaVersion: true,
        compilerVersion: true,
        validationReport: true,
        publishedById: true,
        publishedAt: true,
      },
    })
  }

  async getExecutionSpec(tenantId: string, pipelineId: string) {
    const resolvedTenantId = await resolveTenantId(tenantId)
    const pipeline = await prisma.workflowPipeline.findFirst({
      where: {
        id: pipelineId,
        tenantId: resolvedTenantId,
        status: 'ACTIVE',
        activeVersion: { not: null },
      },
      select: { id: true, activeVersion: true },
    })
    if (!pipeline || pipeline.activeVersion === null) {
      throw new NotFoundException(`Active workflow '${pipelineId}' was not found.`)
    }

    const version = await prisma.workflowVersion.findUnique({
      where: {
        pipelineId_version: {
          pipelineId,
          version: pipeline.activeVersion,
        },
      },
      select: {
        version: true,
        definition: true,
        inputSchema: true,
        outputSchema: true,
        checksum: true,
        schemaVersion: true,
        compilerVersion: true,
      },
    })
    if (!version) {
      throw new ServiceUnavailableException(
        'The active workflow version is unavailable. Execution has been blocked.',
      )
    }

    return {
      tenantId: resolvedTenantId,
      workflowId: pipeline.id,
      ...version,
    }
  }

  async getIngestionStreams(tenantId: string) {
    const resolvedTenantId = await resolveTenantId(tenantId)
    return prisma.ingestionStream.findMany({
      where: { tenantId: resolvedTenantId },
      orderBy: { createdAt: 'desc' },
    })
  }

  private validateGraph(graph: WorkflowGraphDto): GraphValidationReport {
    if (graph.nodes.length === 0) {
      throw new ConflictException('A workflow must contain at least one node.')
    }

    const nodeIds = new Set<string>()
    for (const node of graph.nodes) {
      if (nodeIds.has(node.id)) throw new ConflictException(`Duplicate workflow node '${node.id}'.`)
      nodeIds.add(node.id)
    }

    const incoming = new Map(Array.from(nodeIds, (id) => [id, 0]))
    const outgoing = new Map(Array.from(nodeIds, (id) => [id, [] as string[]]))
    for (const edge of graph.edges) {
      if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
        throw new ConflictException('Every workflow edge must reference existing nodes.')
      }
      incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1)
      outgoing.get(edge.source)?.push(edge.target)
    }

    const roots = Array.from(incoming.entries()).filter(([, count]) => count === 0)
    if (roots.length !== 1) {
      throw new ConflictException('A workflow must have exactly one root trigger node.')
    }

    const queue = [roots[0]![0]]
    const visited = new Set<string>()
    while (queue.length > 0) {
      const nodeId = queue.shift()!
      if (visited.has(nodeId)) continue
      visited.add(nodeId)
      for (const target of outgoing.get(nodeId) ?? []) {
        const nextCount = (incoming.get(target) ?? 0) - 1
        incoming.set(target, nextCount)
        if (nextCount === 0) queue.push(target)
      }
    }
    if (visited.size !== graph.nodes.length) {
      throw new ConflictException('Workflow contains a cycle or unreachable node.')
    }

    return {
      valid: true,
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
      rootNodeId: roots[0]![0],
    }
  }

  private canonicalJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map((item) => this.canonicalJson(item)).join(',')}]`
    if (value && typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => `${JSON.stringify(key)}:${this.canonicalJson(item)}`)
      return `{${entries.join(',')}}`
    }
    return JSON.stringify(value)
  }

  private assertNoEmbeddedSecrets(value: unknown, path = 'definition'): void {
    if (Array.isArray(value)) {
      value.forEach((item, index) => this.assertNoEmbeddedSecrets(item, `${path}[${index}]`))
      return
    }
    if (!value || typeof value !== 'object') return

    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const isReference = /ref$/i.test(key)
      const isSensitive = /(password|secret|token|authorization|api[-_]?key|private[-_]?key)/i.test(key)
      if (isSensitive && !isReference && item !== null && item !== '') {
        throw new ConflictException(
          `Embedded credential material is not allowed at '${path}.${key}'. Use a vault-backed reference.`,
        )
      }
      this.assertNoEmbeddedSecrets(item, `${path}.${key}`)
    }
  }

  private async withSerializableRetry<T>(operation: () => Promise<T>): Promise<T> {
    let attempt = 0
    while (attempt < runtimeConfig.workflowPublishMaxRetries) {
      try {
        return await operation()
      } catch (error) {
        attempt += 1
        const code =
          typeof error === 'object' && error !== null && 'code' in error
            ? String(error.code)
            : undefined
        if (
          attempt >= runtimeConfig.workflowPublishMaxRetries ||
          (code !== 'P2034' && code !== 'P2002')
        ) {
          throw error
        }
      }
    }
    throw new ConflictException('Workflow publication could not acquire a consistent version.')
  }
}
