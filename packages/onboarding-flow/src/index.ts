/**
 * @gigalibs/onboarding-flow
 *
 * Enterprise Multi-Step Signup & Onboarding Orchestrator.
 * Handles company verification, workspace slug reservation, team invites,
 * and initial setup checklists.
 *
 * @module
 */

function generateId(): string {
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export type OnboardingStep =
  | 'ACCOUNT_CREATED'
  | 'COMPANY_PROFILE'
  | 'WORKSPACE_SLUG'
  | 'PLAN_SELECTION'
  | 'TEAM_INVITES'
  | 'COMPLETED';

export interface CompanyProfileData {
  companyName: string;
  industry: string;
  companySize: '1-10' | '11-50' | '51-200' | '201-1000' | '1000+';
  country: string;
  website?: string;
}

export interface OnboardingState {
  id: string;
  userId: string;
  tenantId?: string;
  currentStep: OnboardingStep;
  completedSteps: OnboardingStep[];
  companyProfile?: CompanyProfileData;
  workspaceSlug?: string;
  selectedPlanId?: string;
  invitedEmails: string[];
  isCompleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class OnboardingManager {
  private static stepOrder: OnboardingStep[] = [
    'ACCOUNT_CREATED',
    'COMPANY_PROFILE',
    'WORKSPACE_SLUG',
    'PLAN_SELECTION',
    'TEAM_INVITES',
    'COMPLETED',
  ];

  static initialize(userId: string): OnboardingState {
    return {
      id: generateId(),
      userId,
      currentStep: 'COMPANY_PROFILE',
      completedSteps: ['ACCOUNT_CREATED'],
      invitedEmails: [],
      isCompleted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  static advanceStep(state: OnboardingState, nextStep: OnboardingStep): OnboardingState {
    const currentIndex = this.stepOrder.indexOf(state.currentStep);
    const nextIndex = this.stepOrder.indexOf(nextStep);

    if (nextIndex <= currentIndex) {
      return state;
    }

    const updatedCompleted = Array.from(new Set([...state.completedSteps, state.currentStep]));

    return {
      ...state,
      currentStep: nextStep,
      completedSteps: updatedCompleted,
      isCompleted: nextStep === 'COMPLETED',
      updatedAt: new Date(),
    };
  }

  static sanitizeSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}
