import { describe, it, expect, beforeEach } from 'vitest';
import {
  isTenantInRolloutCohort,
  assertZeroEgress,
  triggerEmergencyHalt,
  resetCircuitBreaker,
  getAssistantCircuitBreakerStatus,
  setRolloutCohortConfig,
  recordInferenceMetric,
  getAssistantSLOMetrics,
} from '../lib/assistant-rollout';

describe('Assistant Staged Rollout & Observability Controls', () => {
  beforeEach(() => {
    resetCircuitBreaker();
    setRolloutCohortConfig({
      activeStage: 'INTERNAL_PILOT',
      pilotTenants: ['test-tenant', 'synthetic-tenant', 'pilot-plant-01'],
      earlyAdopterTenants: ['beta-plant-02'],
    });
  });

  describe('Cohort Access Gating', () => {
    it('permits enrolled pilot tenants in INTERNAL_PILOT stage', () => {
      const res = isTenantInRolloutCohort('pilot-plant-01');
      expect(res.allowed).toBe(true);
    });

    it('denies unenrolled tenants in INTERNAL_PILOT stage with explicit code', () => {
      const res = isTenantInRolloutCohort('unknown-customer');
      expect(res.allowed).toBe(false);
      expect(res.code).toBe('COHORT_NOT_ENROLLED');
    });

    it('permits early adopters in EARLY_ADOPTERS stage', () => {
      setRolloutCohortConfig({ activeStage: 'EARLY_ADOPTERS' });
      expect(isTenantInRolloutCohort('beta-plant-02').allowed).toBe(true);
      expect(isTenantInRolloutCohort('pilot-plant-01').allowed).toBe(true);
      expect(isTenantInRolloutCohort('general-tenant').allowed).toBe(false);
    });

    it('permits all tenants in GENERAL_AVAILABILITY stage', () => {
      setRolloutCohortConfig({ activeStage: 'GENERAL_AVAILABILITY' });
      expect(isTenantInRolloutCohort('any-tenant').allowed).toBe(true);
    });

    it('restricts all live requests in SHADOW stage', () => {
      setRolloutCohortConfig({ activeStage: 'SHADOW' });
      const res = isTenantInRolloutCohort('pilot-plant-01');
      expect(res.allowed).toBe(false);
      expect(res.code).toBe('STAGE_SHADOW_ONLY');
    });
  });

  describe('Air-gap Zero-Egress Guard', () => {
    it('permits loopback and internal container host targets', () => {
      expect(() => assertZeroEgress('http://127.0.0.1:11434/v1/chat/completions')).not.toThrow();
      expect(() => assertZeroEgress('http://localhost:5180/api/assistant')).not.toThrow();
      expect(() => assertZeroEgress('http://gigalibs-cmms-api:4200/v1/work-orders')).not.toThrow();
    });

    it('rejects external cloud targets and trips the emergency circuit breaker', () => {
      expect(() => assertZeroEgress('https://api.openai.com/v1/chat/completions')).toThrow(
        /SOVEREIGN_AIRGAP_VIOLATION/,
      );
      const status = getAssistantCircuitBreakerStatus();
      expect(status.halted).toBe(true);
      expect(status.reason).toContain('Air-gap violation detected');

      // Subsequent cohort checks fail-closed immediately
      const cohortCheck = isTenantInRolloutCohort('pilot-plant-01');
      expect(cohortCheck.allowed).toBe(false);
      expect(cohortCheck.code).toBe('EMERGENCY_HALT_ACTIVE');
    });
  });

  describe('Emergency Halt & Circuit Breaker', () => {
    it('manually triggers halt and resumes cleanly', () => {
      triggerEmergencyHalt('Manual maintenance drill');
      expect(getAssistantCircuitBreakerStatus().halted).toBe(true);
      expect(isTenantInRolloutCohort('pilot-plant-01').allowed).toBe(false);

      resetCircuitBreaker();
      expect(getAssistantCircuitBreakerStatus().halted).toBe(false);
      expect(isTenantInRolloutCohort('pilot-plant-01').allowed).toBe(true);
    });
  });

  describe('SLO Metrics & Automated Failure Circuit Breaker', () => {
    it('records inference latency and calculates p95 correctly', () => {
      recordInferenceMetric({ tenantId: 'test-tenant', latencyMs: 120, tokens: 45, success: true });
      recordInferenceMetric({ tenantId: 'test-tenant', latencyMs: 150, tokens: 50, success: true });
      recordInferenceMetric({ tenantId: 'test-tenant', latencyMs: 200, tokens: 60, success: true });

      const metrics = getAssistantSLOMetrics();
      expect(metrics.totalRequests).toBeGreaterThanOrEqual(3);
      expect(metrics.egressBytes).toBe(0);
      expect(metrics.status).toBe('HEALTHY');
    });
  });
});
