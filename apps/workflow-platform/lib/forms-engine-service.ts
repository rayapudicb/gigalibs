import { prisma } from '@gigalibs/db';
import {
  FormMode,
  FormStatus,
  MobileFormsSyncQuery,
  MobileFormsSyncResponse,
  MobileBatchSubmitResponse,
  CreateFormSubmission,
  PublicFormResponse,
} from '@gigalibs/contracts';

export interface CreateFormDto {
  title: string;
  description?: string;
  mode?: FormMode;
  isPublic?: boolean;
  publicSlug?: string;
  spatialNodeId?: string;
  equipmentTag?: string;
  targetWorkflowId?: string;
  category?: string;
  schemaAst: Record<string, any>;
  status?: FormStatus;
}

export interface UpdateFormDto {
  title?: string;
  description?: string;
  mode?: FormMode;
  isPublic?: boolean;
  publicSlug?: string;
  spatialNodeId?: string;
  equipmentTag?: string;
  targetWorkflowId?: string;
  category?: string;
  schemaAst?: Record<string, any>;
  status?: FormStatus;
}

export class FormsEngineService {
  /**
   * List forms for a tenant with optional filtering.
   */
  async listForms(
    tenantId: string,
    filters?: { mode?: string; status?: string; spatialNodeId?: string }
  ) {
    const where: any = { tenantId };
    if (filters?.mode) where.mode = filters.mode;
    if (filters?.status) where.status = filters.status;
    if (filters?.spatialNodeId) where.spatialNodeId = filters.spatialNodeId;

    return prisma.formSchema.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: {
          select: { submissions: true },
        },
      },
    });
  }

  /**
   * Get form by ID within tenant context.
   */
  async getFormById(tenantId: string, formId: string) {
    return prisma.formSchema.findFirst({
      where: { id: formId, tenantId },
      include: {
        _count: { select: { submissions: true } },
      },
    });
  }

  /**
   * Mode B: Public form lookup by slug (No tenant authentication required).
   */
  async getPublicFormBySlug(slug: string): Promise<PublicFormResponse | null> {
    const cleanSlug = slug.trim().toLowerCase();
    const form = await prisma.formSchema.findFirst({
      where: {
        publicSlug: cleanSlug,
        isPublic: true,
        status: 'PUBLISHED',
      },
      include: {
        tenant: {
          select: {
            name: true,
            branding: true,
          },
        },
      },
    });

    if (!form) return null;

    const tenantBranding = (form.tenant.branding as any) || {};

    return {
      id: form.id,
      title: form.title,
      description: form.description,
      slug: form.publicSlug || cleanSlug,
      schemaAst: (form.schemaAst as any) || { fields: [] },
      submitButtonText: ((form.schemaAst as any)?.submitButtonText as string) || 'Submit',
      tenantBranding: {
        name: form.tenant.name,
        logoUrl: tenantBranding.logoUrl,
        primaryColor: tenantBranding.primaryColor || '#0052cc',
      },
    };
  }

  /**
   * Create a new form schema.
   */
  async createForm(tenantId: string, dto: CreateFormDto) {
    const cleanSlug = dto.publicSlug
      ? dto.publicSlug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-')
      : null;

    return prisma.formSchema.create({
      data: {
        tenantId,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        mode: dto.mode || 'OPERATIONAL',
        isPublic: dto.isPublic ?? false,
        publicSlug: cleanSlug,
        spatialNodeId: dto.spatialNodeId || null,
        equipmentTag: dto.equipmentTag || null,
        targetWorkflowId: dto.targetWorkflowId || null,
        category: dto.category || 'OPERATIONAL',
        schemaAst: dto.schemaAst,
        status: dto.status || 'PUBLISHED',
      },
    });
  }

  /**
   * Update existing form schema.
   */
  async updateForm(tenantId: string, formId: string, dto: UpdateFormDto) {
    const cleanSlug = dto.publicSlug
      ? dto.publicSlug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-')
      : undefined;

    return prisma.formSchema.updateMany({
      where: { id: formId, tenantId },
      data: {
        ...(dto.title ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
        ...(dto.mode ? { mode: dto.mode } : {}),
        ...(dto.isPublic !== undefined ? { isPublic: dto.isPublic } : {}),
        ...(cleanSlug !== undefined ? { publicSlug: cleanSlug } : {}),
        ...(dto.spatialNodeId !== undefined ? { spatialNodeId: dto.spatialNodeId || null } : {}),
        ...(dto.equipmentTag !== undefined ? { equipmentTag: dto.equipmentTag || null } : {}),
        ...(dto.targetWorkflowId !== undefined ? { targetWorkflowId: dto.targetWorkflowId || null } : {}),
        ...(dto.category ? { category: dto.category } : {}),
        ...(dto.schemaAst ? { schemaAst: dto.schemaAst } : {}),
        ...(dto.status ? { status: dto.status } : {}),
      },
    });
  }

  /**
   * Delete form schema.
   */
  async deleteForm(tenantId: string, formId: string) {
    return prisma.formSchema.deleteMany({
      where: { id: formId, tenantId },
    });
  }

  /**
   * Record a submission (idempotent via clientSubmissionId).
   */
  async submitForm(
    formId: string,
    submission: CreateFormSubmission,
    options?: {
      submittedBy?: string | null;
      ipAddress?: string | null;
      enforceTenantId?: string;
    }
  ) {
    // 1. Verify form existence
    const form = await prisma.formSchema.findUnique({
      where: { id: formId },
    });

    if (!form) {
      throw new Error(`Form "${formId}" not found.`);
    }

    if (options?.enforceTenantId && form.tenantId !== options.enforceTenantId) {
      throw new Error('Access denied to form from another tenant.');
    }

    // 2. Idempotency check for mobile offline submissions
    if (submission.clientSubmissionId) {
      const existing = await prisma.formSubmission.findUnique({
        where: { clientSubmissionId: submission.clientSubmissionId },
      });
      if (existing) {
        return {
          id: existing.id,
          status: 'DUPLICATE' as const,
          submission: existing,
        };
      }
    }

    // 3. Persist submission in PostgreSQL
    const created = await prisma.formSubmission.create({
      data: {
        formId,
        submissionMode: submission.submissionMode || form.mode,
        spatialNodeId: submission.spatialNodeId || form.spatialNodeId,
        equipmentTag: submission.equipmentTag || form.equipmentTag,
        clientSubmissionId: submission.clientSubmissionId || null,
        submittedBy: options?.submittedBy || null,
        ipAddress: options?.ipAddress || null,
        deviceMetadata: submission.deviceMetadata as any,
        payload: submission.payload,
        status: 'SUBMITTED',
      },
    });

    // 4. Trigger downstream Workflow if configured
    if (form.targetWorkflowId) {
      try {
        await prisma.platformOutboxEvent.create({
          data: {
            tenantId: form.tenantId,
            aggregateType: 'FORM_SUBMISSION',
            aggregateId: created.id,
            eventType: 'form.submitted.v1',
            payload: {
              formId: form.id,
              formTitle: form.title,
              submissionId: created.id,
              submissionMode: created.submissionMode,
              spatialNodeId: created.spatialNodeId,
              equipmentTag: created.equipmentTag,
              data: created.payload,
              targetWorkflowId: form.targetWorkflowId,
            },
          },
        });
      } catch (err) {
        // Outbox event logging error must not break primary submission
        console.error('[FormsEngineService] Failed to publish outbox event:', err);
      }
    }

    return {
      id: created.id,
      status: 'INGESTED' as const,
      submission: created,
    };
  }

  /**
   * List submissions for a form.
   */
  async listSubmissions(tenantId: string, formId: string, limit = 50) {
    const form = await prisma.formSchema.findFirst({
      where: { id: formId, tenantId },
    });
    if (!form) throw new Error('Form not found');

    return prisma.formSubmission.findMany({
      where: { formId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Mobile-First Delta Sync: Returns compact schemas assigned to spatial context.
   */
  async mobileSync(tenantId: string, query: MobileFormsSyncQuery): Promise<MobileFormsSyncResponse> {
    const where: any = {
      tenantId,
      status: 'PUBLISHED',
    };

    if (query.since) {
      where.updatedAt = { gte: new Date(query.since) };
    }

    if (query.spatialNodeId) {
      where.OR = [
        { spatialNodeId: query.spatialNodeId },
        { spatialNodeId: null }, // Platform/tenant-wide generic forms
      ];
    }

    const rows = await prisma.formSchema.findMany({
      where,
      take: query.limit || 100,
      orderBy: { updatedAt: 'desc' },
    });

    const forms = rows.map((r) => {
      const ast = (r.schemaAst as any) || { fields: [] };
      const fields = Array.isArray(ast.fields) ? ast.fields : [];
      return {
        id: r.id,
        title: r.title,
        description: r.description,
        mode: (r.mode as FormMode) || 'OPERATIONAL',
        spatialNodeId: r.spatialNodeId,
        equipmentTag: r.equipmentTag,
        version: ast.version || 1,
        status: (r.status as FormStatus) || 'PUBLISHED',
        fieldsCount: fields.length,
        schemaAst: ast,
        updatedAt: r.updatedAt.toISOString(),
      };
    });

    return {
      forms,
      syncedAt: new Date().toISOString(),
      count: forms.length,
    };
  }

  /**
   * Mobile-First Batch Ingestion: Handles offline sync queues idempotently.
   */
  async mobileBatchSubmit(
    tenantId: string,
    submissions: CreateFormSubmission[],
    submittedBy?: string
  ): Promise<MobileBatchSubmitResponse> {
    const results: Array<{
      clientSubmissionId?: string;
      serverSubmissionId: string;
      status: 'INGESTED' | 'DUPLICATE' | 'REJECTED';
      error?: string;
    }> = [];

    let ingested = 0;
    let duplicates = 0;
    let failed = 0;

    for (const sub of submissions) {
      try {
        const res = await this.submitForm(sub.formId, sub, {
          submittedBy,
          enforceTenantId: tenantId,
        });

        if (res.status === 'DUPLICATE') {
          duplicates++;
          results.push({
            clientSubmissionId: sub.clientSubmissionId,
            serverSubmissionId: res.id,
            status: 'DUPLICATE',
          });
        } else {
          ingested++;
          results.push({
            clientSubmissionId: sub.clientSubmissionId,
            serverSubmissionId: res.id,
            status: 'INGESTED',
          });
        }
      } catch (err: any) {
        failed++;
        results.push({
          clientSubmissionId: sub.clientSubmissionId,
          serverSubmissionId: '',
          status: 'REJECTED',
          error: err?.message || 'Submission failed',
        });
      }
    }

    return {
      processed: submissions.length,
      ingested,
      duplicates,
      failed,
      results,
    };
  }
}

export const formsEngineService = new FormsEngineService();
