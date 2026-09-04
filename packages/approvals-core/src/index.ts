/**
 * @gigalibs/approvals-core
 *
 * Multi-stage sequential and parallel approval workflow engine.
 * One-click decision tokens, threshold rules, and escalation timeouts.
 *
 * @module
 */

import { generateId, generateSecureToken } from '@gigalibs/crypto';

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface ApprovalStep {
  stepIndex: number;
  approverRole?: string;
  approverUserId?: string;
  status: ApprovalStatus;
  decisionBy?: string;
  decisionAt?: Date | null;
  comments?: string;
}

export interface ApprovalRequest {
  id: string;
  tenantId: string;
  entityType: string; // e.g. 'expense', 'contract', 'access_request'
  entityId: string;
  requesterId: string;
  currentStepIndex: number;
  status: ApprovalStatus;
  steps: ApprovalStep[];
  actionToken: string; // for one-click email actions
  createdAt: Date;
}

export class ApprovalEngine {
  static createRequest(
    tenantId: string,
    entityType: string,
    entityId: string,
    requesterId: string,
    approvers: Array<{ approverRole?: string; approverUserId?: string }>,
  ): ApprovalRequest {
    if (approvers.length === 0) throw new Error('At least one approver is required.');
    const steps: ApprovalStep[] = approvers.map((a, index) => ({
      stepIndex: index,
      ...(a.approverRole ? { approverRole: a.approverRole } : {}),
      ...(a.approverUserId ? { approverUserId: a.approverUserId } : {}),
      status: 'PENDING',
    }));
    if (steps.some((step) => !step.approverRole && !step.approverUserId)) {
      throw new Error('Every approval step requires an approver role or user ID.');
    }

    return {
      id: generateId(),
      tenantId,
      entityType,
      entityId,
      requesterId,
      currentStepIndex: 0,
      status: 'PENDING',
      steps,
      actionToken: generateSecureToken(32),
      createdAt: new Date(),
    };
  }

  static processDecision(
    request: ApprovalRequest,
    decision: 'APPROVED' | 'REJECTED',
    deciderUserId: string,
    comments?: string,
  ): ApprovalRequest {
    if (request.status !== 'PENDING') {
      throw new Error('Approval request is not pending.');
    }

    const currentStep = request.steps[request.currentStepIndex];
    if (!currentStep) throw new Error('Invalid step index.');

    currentStep.status = decision;
    currentStep.decisionBy = deciderUserId;
    currentStep.decisionAt = new Date();
    if (comments !== undefined) currentStep.comments = comments;

    if (decision === 'REJECTED') {
      request.status = 'REJECTED';
    } else {
      // If approved, check if next step exists
      if (request.currentStepIndex + 1 < request.steps.length) {
        request.currentStepIndex += 1;
      } else {
        request.status = 'APPROVED'; // All steps passed
      }
    }

    return request;
  }
}
