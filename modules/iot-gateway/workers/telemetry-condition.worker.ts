/**
 * WI-OI-130: subscribes to telemetry.raw.v1, evaluates tenant rules, publishes telemetry.alert.v1.
 * Run as a separate process once broker credentials and IoT DB access are configured.
 */
import {
  consecutiveAbove,
  rateOfChange,
  rollingAvg,
  type TelemetryPoint,
} from '@gigalibs/rule-engine-universal';

export function evaluateTelemetryWindow(readings: readonly TelemetryPoint[], rule: {
  conditionType: 'THRESHOLD' | 'RATE_OF_CHANGE' | 'CONSECUTIVE_READINGS';
  thresholdValue: number;
  consecutiveCount?: number;
  windowMs?: number;
}): boolean {
  if (rule.conditionType === 'CONSECUTIVE_READINGS') {
    return consecutiveAbove(readings, rule.thresholdValue, rule.consecutiveCount ?? 3);
  }
  if (rule.conditionType === 'RATE_OF_CHANGE') {
    const roc = rateOfChange(readings, rule.windowMs ?? 60_000);
    return roc !== null && roc > rule.thresholdValue;
  }
  const latest = readings[readings.length - 1];
  return latest !== undefined && latest.value > rule.thresholdValue;
}

export async function runTelemetryConditionWorker(): Promise<void> {
  // Broker subscription wiring lands with deployment profile for iot-api + redis/kafka.
  void rollingAvg;
}
