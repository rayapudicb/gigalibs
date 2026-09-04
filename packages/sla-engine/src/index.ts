/**
 * @gigalibs/sla-engine
 *
 * Service Level Agreement (SLA) policy evaluator, First Response Time (FRT),
 * Resolution breach detector, countdown calculators, and automated escalation timers.
 *
 * @module
 */

export type TicketPriority = 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';

export type SlaStatus = 'ON_TRACK' | 'AT_RISK' | 'BREACHED';

export interface SlaPolicy {
  priority: TicketPriority;
  firstResponseMinutes: number;
  resolutionMinutes: number;
  warningThresholdPercent?: number | undefined;
}

export const defaultSlaPolicies: Record<TicketPriority, SlaPolicy> = {
  URGENT: { priority: 'URGENT', firstResponseMinutes: 15, resolutionMinutes: 120, warningThresholdPercent: 75 },
  HIGH: { priority: 'HIGH', firstResponseMinutes: 60, resolutionMinutes: 480, warningThresholdPercent: 75 },
  MEDIUM: { priority: 'MEDIUM', firstResponseMinutes: 240, resolutionMinutes: 1440, warningThresholdPercent: 75 },
  LOW: { priority: 'LOW', firstResponseMinutes: 480, resolutionMinutes: 2880, warningThresholdPercent: 75 },
};

export interface SlaEvaluation {
  priority: TicketPriority;
  policy: SlaPolicy;
  frtTargetDate: Date;
  resolutionTargetDate: Date;
  frtMinutesRemaining: number;
  resolutionMinutesRemaining: number;
  frtStatus: SlaStatus;
  resolutionStatus: SlaStatus;
  frtBreached: boolean;
  resolutionBreached: boolean;
  overallStatus: SlaStatus;
}

export class SlaEngine {
  /**
   * Evaluates complete SLA state against a ticket's timestamps and policy.
   */
  static evaluate(
    createdAt: Date,
    priority: TicketPriority,
    customPolicy?: Partial<SlaPolicy> | undefined,
    firstResponseAt?: Date | null | undefined,
    resolvedAt?: Date | null | undefined,
    now: Date = new Date(),
  ): SlaEvaluation {
    const defaultPolicy = defaultSlaPolicies[priority];
    const policy: SlaPolicy = {
      priority,
      firstResponseMinutes: customPolicy?.firstResponseMinutes ?? defaultPolicy.firstResponseMinutes,
      resolutionMinutes: customPolicy?.resolutionMinutes ?? defaultPolicy.resolutionMinutes,
      warningThresholdPercent: customPolicy?.warningThresholdPercent ?? defaultPolicy.warningThresholdPercent,
    };

    const createdMs = new Date(createdAt).getTime();
    const nowMs = now.getTime();
    const warnPct = (policy.warningThresholdPercent ?? 75) / 100;

    const frtTargetMs = createdMs + policy.firstResponseMinutes * 60 * 1000;
    const resTargetMs = createdMs + policy.resolutionMinutes * 60 * 1000;

    const frtTargetDate = new Date(frtTargetMs);
    const resolutionTargetDate = new Date(resTargetMs);

    // FRT calculation
    const frtEffectiveEndMs = firstResponseAt ? new Date(firstResponseAt).getTime() : nowMs;
    const frtBreached = frtEffectiveEndMs > frtTargetMs;
    const frtDiffMs = frtTargetMs - frtEffectiveEndMs;
    const frtMinutesRemaining = Math.round(frtDiffMs / (60 * 1000));

    let frtStatus: SlaStatus = 'ON_TRACK';
    if (frtBreached) {
      frtStatus = 'BREACHED';
    } else if (!firstResponseAt && (nowMs - createdMs) > (policy.firstResponseMinutes * 60 * 1000 * warnPct)) {
      frtStatus = 'AT_RISK';
    }

    // Resolution calculation
    const resEffectiveEndMs = resolvedAt ? new Date(resolvedAt).getTime() : nowMs;
    const resolutionBreached = resEffectiveEndMs > resTargetMs;
    const resDiffMs = resTargetMs - resEffectiveEndMs;
    const resolutionMinutesRemaining = Math.round(resDiffMs / (60 * 1000));

    let resolutionStatus: SlaStatus = 'ON_TRACK';
    if (resolutionBreached) {
      resolutionStatus = 'BREACHED';
    } else if (!resolvedAt && (nowMs - createdMs) > (policy.resolutionMinutes * 60 * 1000 * warnPct)) {
      resolutionStatus = 'AT_RISK';
    }

    // Overall status
    let overallStatus: SlaStatus = 'ON_TRACK';
    if (frtStatus === 'BREACHED' || resolutionStatus === 'BREACHED') {
      overallStatus = 'BREACHED';
    } else if (frtStatus === 'AT_RISK' || resolutionStatus === 'AT_RISK') {
      overallStatus = 'AT_RISK';
    }

    return {
      priority,
      policy,
      frtTargetDate,
      resolutionTargetDate,
      frtMinutesRemaining,
      resolutionMinutesRemaining,
      frtStatus,
      resolutionStatus,
      frtBreached,
      resolutionBreached,
      overallStatus,
    };
  }

  /**
   * Formats remaining minutes into human-readable format.
   */
  static formatRemaining(minutes: number): string {
    if (minutes <= 0) {
      const overdue = Math.abs(minutes);
      if (overdue < 60) return `${overdue}m overdue`;
      const hours = (overdue / 60).toFixed(1);
      return `${hours}h overdue`;
    }
    if (minutes < 60) return `${minutes}m remaining`;
    const hours = (minutes / 60).toFixed(1);
    return `${hours}h remaining`;
  }
}
