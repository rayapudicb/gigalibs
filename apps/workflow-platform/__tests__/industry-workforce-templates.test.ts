import { describe, expect, it } from 'vitest';
import { ConfigurationDefinitionSchema } from '@gigalibs/contracts';
import {
  INDUSTRY_WORKFORCE_TEMPLATES,
  getIndustryTemplateById,
  getIndustryTemplatesByVertical,
} from '../lib/industry-workforce-templates';
import { executeIndustryWorkflowDag } from '../lib/industry-workflow-dag';
import type { IndustryWorkflowPorts } from '../lib/industry-workflow-dag';

const RECEIPTS = {
  capability: '1'.repeat(64),
  emergency: '2'.repeat(64),
  transition: '3'.repeat(64),
  billing: '4'.repeat(64),
  final: '5'.repeat(64),
};

function workflowPorts(): IndustryWorkflowPorts {
  return {
    verifyCapability: async () => ({ receiptSha256: RECEIPTS.capability }),
    createEmergencyWorkOrder: async () => ({
      workOrderId: '00000000-0000-0000-0000-000000000099',
      receiptSha256: RECEIPTS.emergency,
    }),
    transitionAllocation: async () => ({ receiptSha256: RECEIPTS.transition }),
    postBillableTime: async ({ hours }) => ({
      postedHours: hours,
      receiptSha256: RECEIPTS.billing,
    }),
    finalizeExecution: async () => ({ receiptSha256: RECEIPTS.final }),
  };
}

describe('Phase 7: Industry Workforce Templates & Workflow Integration (ADR-0003)', () => {
  describe('Industry Template Schema Validation', () => {
    it('contains all 6 required industry vertical templates', () => {
      expect(INDUSTRY_WORKFORCE_TEMPLATES.length).toBe(6);

      const requiredIndustries = [
        'CREWING_ENTERTAINMENT',
        'PHARMA_CLEANROOM',
        'AGRI_FIELD_WORKERS',
        'CONSTRUCTION_CIVIL',
        'MANUFACTURING_PLANT',
        'HEALTHCARE_CLINICAL',
      ];

      const industriesInCatalog = new Set(INDUSTRY_WORKFORCE_TEMPLATES.map((t) => t.industry));
      for (const industry of requiredIndustries) {
        expect(industriesInCatalog.has(industry as any)).toBe(true);
      }
    });

    it('validates every industry template strictly against ConfigurationDefinitionSchema with 0 errors', () => {
      for (const template of INDUSTRY_WORKFORCE_TEMPLATES) {
        const parsed = ConfigurationDefinitionSchema.safeParse(template.definition);
        if (!parsed.success) {
          console.error(`Validation failed for industry template: ${template.id}`, parsed.error.format());
        }
        expect(parsed.success).toBe(true);
      }
    });

    it('ensures every section references only existing fields in that template', () => {
      for (const template of INDUSTRY_WORKFORCE_TEMPLATES) {
        const fieldKeySet = new Set(template.definition.fields.map((f) => f.key));
        for (const section of template.definition.sections) {
          for (const key of section.fieldKeys) {
            expect(fieldKeySet.has(key)).toBe(true);
          }
        }
      }
    });

    it('verifies lookup functions by ID and by vertical', () => {
      const crewing = getIndustryTemplateById('crewing-stagehand-callsheet');
      expect(crewing).toBeDefined();
      expect(crewing?.requiredCapabilityCode).toBe('RIGGING_SAFETY_L2');

      const pharmaList = getIndustryTemplatesByVertical('PHARMA_CLEANROOM');
      expect(pharmaList.length).toBe(1);
      expect(pharmaList[0].id).toBe('pharma-cleanroom-protocol');
    });

    it('upholds ADR-0003 Decision 8: vertical jargon lives exclusively in presentation templates', () => {
      // Presentation template names may contain industry jargon:
      const crewingTemplate = getIndustryTemplateById('crewing-stagehand-callsheet')!;
      expect(crewingTemplate.name).toContain('Crewing');
      expect(crewingTemplate.tags).toContain('Rigging');

      // But the moduleKey and contract interface remain neutral:
      expect(crewingTemplate.definition.moduleKey).toBe('tenant-apps');
    });
  });

  describe('Industry Workflow DAG Integration', () => {
    it('executes clean workflow on successful safety inspection and posts billable time', async () => {
      const result = await executeIndustryWorkflowDag({
        templateId: 'crewing-stagehand-callsheet',
        tenantId: '00000000-0000-0000-0000-000000000001',
        resourceId: 'res-rigger-101',
        allocationId: 'alloc-show-01',
        formData: {
          'event-title': 'Arena World Tour 2026',
          'venue-name': 'Grand Stadium Main Stage',
          'fall-arrest-harness-inspected': true,
          'truss-load-limit-kg': 1200,
        },
        submittedBy: 'usr-stage-manager',
        submittedAt: new Date().toISOString(),
        billableHours: 8,
      }, workflowPorts());

      expect(result.status).toBe('COMPLETED_SUCCESS');
      expect(result.incidentCreated).toBe(false);
      expect(result.allocationNextStatus).toBe('COMPLETED');
      expect(result.billableHoursPosted).toBe(8.0);
      expect(result.steps.length).toBe(4);
      expect(result.steps[0].stepName).toBe('VERIFY_CAPABILITY_ACCREDITATION');
      expect(result.steps[1].stepName).toBe('EVALUATE_SAFETY_PARAMETERS');
      expect(result.steps[2].stepName).toBe('TRANSITION_ALLOCATION_LIFECYCLE');
      expect(result.steps[3].stepName).toBe('POST_BILLABLE_TIME_LEDGER');
      expect(result.fipsAuditDigest).toMatch(/^[a-f0-9]{64}$/);
    });

    it('triggers reactive CMMS emergency and aborts allocation on safety failure', async () => {
      const result = await executeIndustryWorkflowDag({
        templateId: 'civil-construction-prestart',
        tenantId: '00000000-0000-0000-0000-000000000001',
        resourceId: 'res-operator-505',
        allocationId: 'alloc-trench-02',
        formData: {
          'jobsite-id': 'Site-B-Section-4',
          'hydraulic-system-intact': false, // Safety failure!
          'trench-shoring-verified': true,
        },
        submittedBy: 'usr-safety-officer',
        submittedAt: new Date().toISOString(),
      }, workflowPorts());

      expect(result.status).toBe('COMPLETED_WITH_INCIDENT');
      expect(result.incidentCreated).toBe(true);
      expect(result.allocationNextStatus).toBe('CANCELLED');
      expect(result.billableHoursPosted).toBe(0);

      const safetyStep = result.steps.find((s) => s.stepName === 'EVALUATE_SAFETY_PARAMETERS');
      expect(safetyStep?.status).toBe('TRIGGERED_REACTIVE_ACTION');
      expect(safetyStep?.details).toContain(
        'Emergency work order 00000000-0000-0000-0000-000000000099 was accepted by CMMS',
      );
      expect(result.fipsAuditDigest).toMatch(/^[a-f0-9]{64}$/);
    });

    it('fails closed when no persisted allocation or real module adapters are supplied', async () => {
      await expect(
        executeIndustryWorkflowDag(
          {
            templateId: 'crewing-stagehand-callsheet',
            tenantId: '00000000-0000-0000-0000-000000000001',
            resourceId: 'res-1',
            formData: {},
            submittedBy: 'usr-1',
            submittedAt: new Date().toISOString(),
          },
          workflowPorts(),
        ),
      ).rejects.toThrow('persisted allocationId');
    });
  });
});
