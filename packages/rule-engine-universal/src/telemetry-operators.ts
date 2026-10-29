export interface TelemetryPoint {
  readonly value: number;
  readonly readAtMs: number;
}

export function rollingAvg(readings: readonly TelemetryPoint[], windowMs: number): number | null {
  if (readings.length === 0 || windowMs <= 0) return null;
  const latest = readings[readings.length - 1]!.readAtMs;
  const cutoff = latest - windowMs;
  const window = readings.filter((point) => point.readAtMs >= cutoff);
  if (window.length === 0) return null;
  const sum = window.reduce((acc, point) => acc + point.value, 0);
  return sum / window.length;
}

export function rateOfChange(readings: readonly TelemetryPoint[], windowMs: number): number | null {
  if (readings.length < 2 || windowMs <= 0) return null;
  const latest = readings[readings.length - 1]!;
  const cutoff = latest.readAtMs - windowMs;
  const earlier = readings.find((point) => point.readAtMs >= cutoff);
  if (!earlier || earlier.readAtMs === latest.readAtMs) return null;
  const deltaValue = latest.value - earlier.value;
  const deltaMs = latest.readAtMs - earlier.readAtMs;
  return (deltaValue / deltaMs) * 1000;
}

export function consecutiveAbove(
  readings: readonly TelemetryPoint[],
  threshold: number,
  count: number,
): boolean {
  if (count < 1 || readings.length < count) return false;
  const tail = readings.slice(-count);
  return tail.every((point) => point.value > threshold);
}
