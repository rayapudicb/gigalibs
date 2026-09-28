import type { AllocationStatus } from '@gigalibs/contracts';
import { getIndustryTemplateById, type IndustryVertical } from './industry-workforce-templates';

export interface WorkflowSubmissionPayload {
  templateId: string;
  tenantId: string;
  resourceId: string;
  allocationId?: string;
  workOrderId?: string;
  formData: Record<string, any>;
  submittedBy: string;
  submittedAt: string;
  billableHours?: number;
}

export interface IndustryWorkflowPorts {
  verifyCapability(input: {
    tenantId: string;
    resourceId: string;
    capabilityCode: string;
    allocationId: string;
  }): Promise<{ receiptSha256: string }>;
  createEmergencyWorkOrder(input: {
    tenantId: string;
    sourceAllocationId: string;
    reason: string;
    submittedBy: string;
  }): Promise<{ workOrderId: string; receiptSha256: string }>;
  transitionAllocation(input: {
    tenantId: string;
    allocationId: string;
    targetStatus: AllocationStatus;
    reason: string;
    submittedBy: string;
  }): Promise<{ receiptSha256: string }>;
  postBillableTime(input: {
    tenantId: string;
    allocationId: string;
    resourceId: string;
    hours: number;
    submittedBy: string;
  }): Promise<{ postedHours: number; receiptSha256: string }>;
  finalizeExecution(input: {
    executionId: string;
    tenantId: string;
    templateId: string;
    stepReceipts: string[];
  }): Promise<{ receiptSha256: string }>;
}

export interface WorkflowExecutionStepResult {
  stepIndex: number;
  stepName: string;
  targetModule: 'WORKFORCE' | 'CMMS' | 'ACCOUNTS_RECEIVABLE' | 'SAGA_ORCHESTRATOR';
  status: 'SUCCESS' | 'TRIGGERED_REACTIVE_ACTION' | 'REJECTED';
  details: string;
  receiptSha256?: string;
}

export interface WorkflowExecutionResult {
  executionId: string;
  templateId: string;
  industry: IndustryVertical;
  status: 'COMPLETED_SUCCESS' | 'COMPLETED_WITH_INCIDENT' | 'FAILED';
  steps: WorkflowExecutionStepResult[];
  allocationNextStatus?: AllocationStatus;
  incidentCreated?: boolean;
  billableHoursPosted?: number;
  fipsAuditDigest: string;
}

/**
 * Execute multi-module workflow DAG triggered by an Industry Form submission.
 * Preserves strict decoupled boundaries across Workforce, CMMS, and Accounts Receivable.
 */
export async function executeIndustryWorkflowDag(
  payload: WorkflowSubmissionPayload,
  ports: IndustryWorkflowPorts,
): Promise<WorkflowExecutionResult> {
  const template = getIndustryTemplateById(payload.templateId);
  if (!template) {
    throw new Error(`Unknown industry workflow template: ${payload.templateId}`);
  }
  if (!payload.allocationId) {
    throw new Error('Industry workflow execution requires a persisted allocationId.');
  }

  const steps: WorkflowExecutionStepResult[] = [];
  const executionId = `wf-exec-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  let incidentCreated = false;
  let nextAllocationStatus: AllocationStatus = 'COMPLETED';
  const stepReceipts: string[] = [];

  // Step 1: Validate capability requirement against Universal Workforce
  const requiredCap = template.requiredCapabilityCode;
  const capabilityReceipt = await ports.verifyCapability({
    tenantId: payload.tenantId,
    resourceId: payload.resourceId,
    capabilityCode: requiredCap,
    allocationId: payload.allocationId,
  });
  stepReceipts.push(requireReceipt(capabilityReceipt.receiptSha256));
  steps.push({
    stepIndex: 1,
    stepName: 'VERIFY_CAPABILITY_ACCREDITATION',
    targetModule: 'WORKFORCE',
    status: 'SUCCESS',
    details: `Capability service verified '${requiredCap}' for the persisted allocation.`,
    receiptSha256: capabilityReceipt.receiptSha256,
  });

  // Step 2: Safety & Critical Parameter Evaluation
  let hasCriticalSafetyFailure = false;
  let failureReason = '';

  if (payload.formData['fall-arrest-harness-inspected'] === false) {
    hasCriticalSafetyFailure = true;
    failureReason = 'Fall arrest harness inspection failed safety check.';
  } else if (payload.formData['gowning-protocol-verified'] === false) {
    hasCriticalSafetyFailure = true;
    failureReason = 'Aseptic cleanroom gowning protocol failed.';
  } else if (payload.formData['pesticide-rei-cleared'] === false) {
    hasCriticalSafetyFailure = true;
    failureReason = 'Pesticide Re-Entry Interval (REI) active; field unsafe for entry.';
  } else if (payload.formData['hydraulic-system-intact'] === false) {
    hasCriticalSafetyFailure = true;
    failureReason = 'Heavy plant hydraulic leak or emergency stop failure.';
  } else if (payload.formData['loto-padlocks-secured'] === false) {
    hasCriticalSafetyFailure = true;
    failureReason = 'LOTO zero energy state verification failed.';
  } else if (payload.formData['reactive-work-order-flag'] === true) {
    hasCriticalSafetyFailure = true;
    failureReason = 'Operator flagged critical machine malfunction requiring emergency repair.';
  }

  if (hasCriticalSafetyFailure) {
    const incident = await ports.createEmergencyWorkOrder({
      tenantId: payload.tenantId,
      sourceAllocationId: payload.allocationId,
      reason: failureReason,
      submittedBy: payload.submittedBy,
    });
    stepReceipts.push(requireReceipt(incident.receiptSha256));
    incidentCreated = true;
    nextAllocationStatus = 'CANCELLED';
    steps.push({
      stepIndex: 2,
      stepName: 'EVALUATE_SAFETY_PARAMETERS',
      targetModule: 'CMMS',
      status: 'TRIGGERED_REACTIVE_ACTION',
      details: `Safety anomaly detected: ${failureReason}. Emergency work order ${incident.workOrderId} was accepted by CMMS.`,
      receiptSha256: incident.receiptSha256,
    });
  } else {
    steps.push({
      stepIndex: 2,
      stepName: 'EVALUATE_SAFETY_PARAMETERS',
      targetModule: 'CMMS',
      status: 'SUCCESS',
      details: 'All operational and safety parameters confirmed within acceptable tolerances.',
    });
  }

  // Step 3: Advance Universal Allocation State
  const transitionReceipt = await ports.transitionAllocation({
    tenantId: payload.tenantId,
    allocationId: payload.allocationId,
    targetStatus: nextAllocationStatus,
    reason: incidentCreated ? failureReason : 'Industry workflow completed successfully.',
    submittedBy: payload.submittedBy,
  });
  stepReceipts.push(requireReceipt(transitionReceipt.receiptSha256));
  steps.push({
    stepIndex: 3,
    stepName: 'TRANSITION_ALLOCATION_LIFECYCLE',
    targetModule: 'WORKFORCE',
    status: 'SUCCESS',
    details: `Allocation ${payload.allocationId} was confirmed at ${nextAllocationStatus}.`,
    receiptSha256: transitionReceipt.receiptSha256,
  });

  // Step 4: Post Billable Labor to Accounts Receivable (if completed successfully)
  if (!incidentCreated) {
    if (!Number.isFinite(payload.billableHours) || (payload.billableHours ?? 0) <= 0) {
      throw new Error('A positive, source-backed billableHours value is required for AR posting.');
    }
    const billingReceipt = await ports.postBillableTime({
      tenantId: payload.tenantId,
      allocationId: payload.allocationId,
      resourceId: payload.resourceId,
      hours: payload.billableHours!,
      submittedBy: payload.submittedBy,
    });
    stepReceipts.push(requireReceipt(billingReceipt.receiptSha256));
    steps.push({
      stepIndex: 4,
      stepName: 'POST_BILLABLE_TIME_LEDGER',
      targetModule: 'ACCOUNTS_RECEIVABLE',
      status: 'SUCCESS',
      details: `AR accepted ${billingReceipt.postedHours} source-backed billable hours.`,
      receiptSha256: billingReceipt.receiptSha256,
    });
  }

  const finalized = await ports.finalizeExecution({
    executionId,
    tenantId: payload.tenantId,
    templateId: payload.templateId,
    stepReceipts,
  });
  const fipsAuditDigest = requireReceipt(finalized.receiptSha256);

  return {
    executionId,
    templateId: payload.templateId,
    industry: template.industry,
    status: incidentCreated ? 'COMPLETED_WITH_INCIDENT' : 'COMPLETED_SUCCESS',
    steps,
    allocationNextStatus: nextAllocationStatus,
    incidentCreated,
    billableHoursPosted: incidentCreated ? 0 : payload.billableHours,
    fipsAuditDigest,
  };
}

function requireReceipt(value: string): string {
  if (!/^[a-f0-9]{64}$/i.test(value)) {
    throw new Error('A module returned an invalid execution receipt.');
  }
  return value.toLowerCase();
}
