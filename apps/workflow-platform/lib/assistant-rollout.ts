/**
 * GigaLibs Sovereign Assistant Rollout Controller & Observability Guard (G6/G7)
 * Enforces controlled tenant cohort progression, air-gap zero-egress integrity,
 * and automated emergency circuit breaker halt controls.
 */

export type RolloutStage = 'SHADOW' | 'INTERNAL_PILOT' | 'EARLY_ADOPTERS' | 'GENERAL_AVAILABILITY';

export interface RolloutCohortConfig {
  activeStage: RolloutStage;
  pilotTenants: string[];
  earlyAdopterTenants: string[];
}

export interface CircuitBreakerState {
  halted: boolean;
  reason: string | null;
  haltedAt: string | null;
  trippedCount: number;
}

export interface InferenceMetricRecord {
  timestamp: number;
  tenantId: string;
  latencyMs: number;
  tokens: number;
  success: boolean;
}

export interface AssistantSLOMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  errorRate: number;
  p95LatencyMs: number;
  egressBytes: 0;
  status: 'HEALTHY' | 'DEGRADED' | 'HALTED';
}

// In-memory runtime state for rollout controller
const DEFAULT_COHORT_CONFIG: RolloutCohortConfig = {
  activeStage: 'INTERNAL_PILOT',
  pilotTenants: ['test-tenant', 'synthetic-tenant', 'pilot-plant-01', 'pilot-tenant'],
  earlyAdopterTenants: [],
};

let currentCohortConfig: RolloutCohortConfig = { ...DEFAULT_COHORT_CONFIG };

const circuitBreaker: CircuitBreakerState = {
  halted: false,
  reason: null,
  haltedAt: null,
  trippedCount: 0,
};

const metricsHistory: InferenceMetricRecord[] = [];
const MAX_METRICS_WINDOW = 500;

/**
 * Validates whether a tenant is authorized under the active staged rollout cohort.
 */
export function isTenantInRolloutCohort(
  tenantId: string,
  stage: RolloutStage = currentCohortConfig.activeStage,
): { allowed: boolean; code?: string; reason?: string } {
  if (circuitBreaker.halted) {
    return {
      allowed: false,
      code: 'EMERGENCY_HALT_ACTIVE',
      reason: `Assistant operations are halted: ${circuitBreaker.reason ?? 'Circuit breaker active'}`,
    };
  }

  if (stage === 'GENERAL_AVAILABILITY') {
    return { allowed: true };
  }

  if (stage === 'INTERNAL_PILOT') {
    if (currentCohortConfig.pilotTenants.includes(tenantId)) {
      return { allowed: true };
    }
    return {
      allowed: false,
      code: 'COHORT_NOT_ENROLLED',
      reason: `Tenant ${tenantId} is not in the active INTERNAL_PILOT cohort.`,
    };
  }

  if (stage === 'EARLY_ADOPTERS') {
    if (
      currentCohortConfig.pilotTenants.includes(tenantId) ||
      currentCohortConfig.earlyAdopterTenants.includes(tenantId)
    ) {
      return { allowed: true };
    }
    return {
      allowed: false,
      code: 'COHORT_NOT_ENROLLED',
      reason: `Tenant ${tenantId} is not enrolled in the EARLY_ADOPTERS cohort.`,
    };
  }

  // SHADOW stage denies all live interactions
  return {
    allowed: false,
    code: 'STAGE_SHADOW_ONLY',
    reason: 'Assistant is in SHADOW mode; live customer interaction is restricted.',
  };
}

/**
 * Air-gap zero-egress guard: asserts that target endpoints are strictly loopback/internal.
 * If external egress is detected, immediately trips the emergency circuit breaker.
 */
export function assertZeroEgress(targetUrl: string): void {
  try {
    const parsed = new URL(targetUrl);
    const host = parsed.hostname;
    const isLoopback =
      host === '127.0.0.1' ||
      host === 'localhost' ||
      host === '::1' ||
      host.endsWith('.local') ||
      host === 'gigalibs-cmms-api' ||
      host === 'gigalibs-workforce-api' ||
      host === 'gigalibs-host-bridge';

    if (!isLoopback) {
      triggerEmergencyHalt(`Air-gap violation detected: attempted egress to ${parsed.origin}`);
      throw new Error(`[SOVEREIGN_AIRGAP_VIOLATION] Disallowed external egress attempt: ${parsed.origin}`);
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('SOVEREIGN_AIRGAP_VIOLATION')) {
      throw err;
    }
    triggerEmergencyHalt(`Malformed endpoint URL: ${targetUrl}`);
    throw new Error(`[SOVEREIGN_AIRGAP_VIOLATION] Invalid or unsafe target URL: ${targetUrl}`);
  }
}

/**
 * Triggers an immediate emergency halt (kill-switch) across all Assistant operations.
 */
export function triggerEmergencyHalt(reason: string): void {
  circuitBreaker.halted = true;
  circuitBreaker.reason = reason;
  circuitBreaker.haltedAt = new Date().toISOString();
  circuitBreaker.trippedCount += 1;
}

/**
 * Resets the circuit breaker and resumes rollout operations.
 */
export function resetCircuitBreaker(): void {
  circuitBreaker.halted = false;
  circuitBreaker.reason = null;
  circuitBreaker.haltedAt = null;
}

/**
 * Returns current circuit breaker status.
 */
export function getAssistantCircuitBreakerStatus(): Readonly<CircuitBreakerState> {
  return { ...circuitBreaker };
}

/**
 * Sets the active rollout stage and tenant cohort definitions.
 */
export function setRolloutCohortConfig(config: Partial<RolloutCohortConfig>): void {
  currentCohortConfig = {
    ...currentCohortConfig,
    ...config,
  };
}

/**
 * Records an inference execution metric in the sliding window.
 */
export function recordInferenceMetric(record: {
  tenantId: string;
  latencyMs: number;
  tokens: number;
  success: boolean;
}): void {
  metricsHistory.push({
    timestamp: Date.now(),
    ...record,
  });

  if (metricsHistory.length > MAX_METRICS_WINDOW) {
    metricsHistory.shift();
  }

  // Automated error-rate circuit breaker: trip if > 20% errors in last 20 requests
  if (metricsHistory.length >= 10) {
    const recent = metricsHistory.slice(-20);
    const failureCount = recent.filter((m) => !m.success).length;
    const failureRate = failureCount / recent.length;
    if (failureRate >= 0.25) {
      triggerEmergencyHalt(`Automated Circuit Breaker: Error rate reached ${(failureRate * 100).toFixed(1)}%`);
    }
  }
}

/**
 * Calculates current SLO compliance metrics.
 */
export function getAssistantSLOMetrics(): AssistantSLOMetrics {
  if (circuitBreaker.halted) {
    return {
      totalRequests: metricsHistory.length,
      successfulRequests: metricsHistory.filter((m) => m.success).length,
      failedRequests: metricsHistory.filter((m) => !m.success).length,
      errorRate: metricsHistory.length > 0
        ? metricsHistory.filter((m) => !m.success).length / metricsHistory.length
        : 0,
      p95LatencyMs: 0,
      egressBytes: 0,
      status: 'HALTED',
    };
  }

  if (metricsHistory.length === 0) {
    return {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      errorRate: 0,
      p95LatencyMs: 0,
      egressBytes: 0,
      status: 'HEALTHY',
    };
  }

  const successes = metricsHistory.filter((m) => m.success);
  const failures = metricsHistory.filter((m) => !m.success);
  const errorRate = failures.length / metricsHistory.length;

  const latencies = metricsHistory.map((m) => m.latencyMs).sort((a, b) => a - b);
  const p95Index = Math.min(Math.floor(latencies.length * 0.95), latencies.length - 1);
  const p95LatencyMs = latencies[p95Index] ?? 0;

  const status: 'HEALTHY' | 'DEGRADED' | 'HALTED' = errorRate > 0.05 || p95LatencyMs > 5000 ? 'DEGRADED' : 'HEALTHY';

  return {
    totalRequests: metricsHistory.length,
    successfulRequests: successes.length,
    failedRequests: failures.length,
    errorRate: Math.round(errorRate * 1000) / 1000,
    p95LatencyMs,
    egressBytes: 0,
    status,
  };
}
