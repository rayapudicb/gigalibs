import { describe, expect, it, vi, beforeEach } from 'vitest';
import { isFormFieldVisible, type FormFieldDefinition } from '@gigalibs/contracts';
import { formsEngineService } from '../lib/forms-engine-service';
import { prisma } from '@gigalibs/db';

vi.mock('@gigalibs/db', () => ({
  prisma: {
    formSchema: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    formSubmission: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    platformOutboxEvent: {
      create: vi.fn(),
    },
  },
}));

describe('Phase 2: Dual-Mode Form Engine & Mobile APIs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Conditional Branching: isFormFieldVisible', () => {
    const dependentField: FormFieldDefinition = {
      id: 'incident_details',
      name: 'incident_details',
      label: 'Incident Remediation Summary',
      type: 'TEXTAREA',
      conditions: [
        {
          dependsOnFieldId: 'has_incidents',
          operator: 'EQUALS',
          value: 'YES',
          action: 'SHOW',
        },
      ],
    };

    it('hides dependent field when condition is not satisfied', () => {
      const visible = isFormFieldVisible(dependentField, { has_incidents: 'NO' });
      expect(visible).toBe(false);
    });

    it('shows dependent field when condition is satisfied', () => {
      const visible = isFormFieldVisible(dependentField, { has_incidents: 'YES' });
      expect(visible).toBe(true);
    });

    it('returns true when field has no conditions', () => {
      const unconditionalField: FormFieldDefinition = {
        id: 'title',
        name: 'title',
        label: 'Title',
        type: 'TEXT',
      };
      expect(isFormFieldVisible(unconditionalField, {})).toBe(true);
    });
  });

  describe('Mode B: Public Dynamic Form Resolution', () => {
    it('returns public form definition with tenant branding', async () => {
      (prisma.formSchema.findFirst as any).mockResolvedValue({
        id: 'form_pub_1',
        title: 'Supplier Compliance 2026',
        description: 'Vendor survey',
        publicSlug: 'supplier-compliance-2026',
        isPublic: true,
        status: 'PUBLISHED',
        schemaAst: {
          fields: [{ id: 'f1', name: 'f1', label: 'Company', type: 'TEXT' }],
          submitButtonText: 'Certify Audit',
        },
        tenant: {
          name: 'Apex Manufacturing Corp',
          branding: { primaryColor: '#0052cc' },
        },
      });

      const result = await formsEngineService.getPublicFormBySlug('supplier-compliance-2026');
      expect(result).not.toBeNull();
      expect(result?.title).toBe('Supplier Compliance 2026');
      expect(result?.tenantBranding?.name).toBe('Apex Manufacturing Corp');
      expect(result?.submitButtonText).toBe('Certify Audit');
    });

    it('returns null when slug does not exist or form is unpublished', async () => {
      (prisma.formSchema.findFirst as any).mockResolvedValue(null);
      const result = await formsEngineService.getPublicFormBySlug('nonexistent-form');
      expect(result).toBeNull();
    });
  });

  describe('Submission Idempotency & Mobile Batch Ingestion', () => {
    it('prevents double-submission when identical clientSubmissionId is replayed', async () => {
      (prisma.formSchema.findUnique as any).mockResolvedValue({
        id: 'form_1',
        tenantId: 'tenant_1',
        mode: 'OPERATIONAL',
      });

      (prisma.formSubmission.findUnique as any).mockResolvedValue({
        id: 'sub_existing_123',
        clientSubmissionId: 'offline_mobile_sub_001',
        status: 'SUBMITTED',
      });

      const result = await formsEngineService.submitForm('form_1', {
        formId: 'form_1',
        clientSubmissionId: 'offline_mobile_sub_001',
        submissionMode: 'OPERATIONAL',
        payload: { reading: 42 },
      });

      expect(result.status).toBe('DUPLICATE');
      expect(result.id).toBe('sub_existing_123');
      expect(prisma.formSubmission.create).not.toHaveBeenCalled();
    });

    it('persists new submission and triggers outbox workflow when configured', async () => {
      (prisma.formSchema.findUnique as any).mockResolvedValue({
        id: 'form_1',
        tenantId: 'tenant_1',
        mode: 'OPERATIONAL',
        targetWorkflowId: 'wf_auto_dispatch_cbm',
      });

      (prisma.formSubmission.findUnique as any).mockResolvedValue(null);
      (prisma.formSubmission.create as any).mockResolvedValue({
        id: 'sub_new_789',
        formId: 'form_1',
        clientSubmissionId: 'offline_mobile_sub_002',
        submissionMode: 'OPERATIONAL',
        payload: { bearingTemp: 92 },
        status: 'SUBMITTED',
      });

      const result = await formsEngineService.submitForm('form_1', {
        formId: 'form_1',
        clientSubmissionId: 'offline_mobile_sub_002',
        submissionMode: 'OPERATIONAL',
        payload: { bearingTemp: 92 },
      });

      expect(result.status).toBe('INGESTED');
      expect(result.id).toBe('sub_new_789');
      expect(prisma.platformOutboxEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            aggregateType: 'FORM_SUBMISSION',
            eventType: 'form.submitted.v1',
          }),
        })
      );
    });

    it('processes batch offline submissions gracefully', async () => {
      (prisma.formSchema.findUnique as any).mockResolvedValue({
        id: 'form_1',
        tenantId: 'tenant_1',
        mode: 'OPERATIONAL',
      });

      // First sub is new, second sub is duplicate
      (prisma.formSubmission.findUnique as any)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'sub_prev', clientSubmissionId: 'cli_2' });

      (prisma.formSubmission.create as any).mockResolvedValue({
        id: 'sub_created_1',
      });

      const batchResult = await formsEngineService.mobileBatchSubmit('tenant_1', [
        {
          formId: 'form_1',
          clientSubmissionId: 'cli_1',
          submissionMode: 'OPERATIONAL',
          payload: { step: 1 },
        },
        {
          formId: 'form_1',
          clientSubmissionId: 'cli_2',
          submissionMode: 'OPERATIONAL',
          payload: { step: 2 },
        },
      ]);

      expect(batchResult.processed).toBe(2);
      expect(batchResult.ingested).toBe(1);
      expect(batchResult.duplicates).toBe(1);
      expect(batchResult.failed).toBe(0);
    });
  });
});
