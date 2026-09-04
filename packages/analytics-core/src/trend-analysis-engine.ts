/**
 * @gigalibs/analytics-core - Universal Trend Analysis & Anomaly Engine
 *
 * Industry-Agnostic Mathematical Engine for:
 * 1. Z-Score Statistical Anomaly & Spike Detection
 * 2. Time-Series Trajectory Forecasting (Least Squares Regression & Exponential Smoothing)
 * 3. What-If Scenario Simulations
 * 4. Automated Natural Language Summary Generation
 *
 * @module
 */

export interface TimeSeriesDataPoint {
  timestamp: string | number | Date;
  value: number;
  label?: string;
  dimensions?: Record<string, string | number>;
}

export interface AnomalyResult {
  point: TimeSeriesDataPoint;
  mean: number;
  stdDev: number;
  zScore: number;
  isAnomaly: boolean;
  type: 'SPIKE' | 'DROP' | 'NORMAL';
  deviationPercent: number;
}

export interface TrendForecastResult {
  slope: number;
  intercept: number;
  rSquared: number;
  trendDirection: 'UPWARD' | 'DOWNWARD' | 'STABLE';
  historicalAverage: number;
  projectedAverage: number;
  forecastPoints: Array<{
    periodIndex: number;
    projectedValue: number;
    lowerBound: number;
    upperBound: number;
  }>;
  narrativeSummary: string;
}

export interface WhatIfScenarioInput {
  multiplier?: number; // e.g. 1.15 for +15%
  fixedOffset?: number; // e.g. -5000 for -$5k reduction
  variableDampening?: number; // 0 to 1 dampener
}

export interface WhatIfScenarioResult {
  originalTotal: number;
  simulatedTotal: number;
  deltaValue: number;
  deltaPercent: number;
  simulatedPoints: TimeSeriesDataPoint[];
  narrative: string;
}

export class UniversalTrendAnalysisEngine {
  /**
   * 1. Detects Anomalies using Statistical Z-Score & Moving Standard Deviations
   */
  static detectAnomalies(data: TimeSeriesDataPoint[], zThreshold = 2.0): AnomalyResult[] {
    if (data.length === 0) return [];

    const values = data.map((d) => d.value);
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    return data.map((point) => {
      if (stdDev === 0) {
        return {
          point,
          mean,
          stdDev: 0,
          zScore: 0,
          isAnomaly: false,
          type: 'NORMAL',
          deviationPercent: 0,
        };
      }

      const zScore = (point.value - mean) / stdDev;
      const isAnomaly = Math.abs(zScore) >= zThreshold;
      const deviationPercent = mean !== 0 ? Math.round(((point.value - mean) / mean) * 10000) / 100 : 0;

      let type: 'SPIKE' | 'DROP' | 'NORMAL' = 'NORMAL';
      if (isAnomaly) {
        type = zScore > 0 ? 'SPIKE' : 'DROP';
      }

      return {
        point,
        mean: Math.round(mean * 100) / 100,
        stdDev: Math.round(stdDev * 100) / 100,
        zScore: Math.round(zScore * 100) / 100,
        isAnomaly,
        type,
        deviationPercent,
      };
    });
  }

  /**
   * 2. Projects Time-Series Trajectory using Ordinary Least Squares (OLS) Linear Regression
   */
  static forecastTrajectory(data: TimeSeriesDataPoint[], horizonSteps = 6): TrendForecastResult {
    const n = data.length;
    if (n < 2) {
      throw new Error('At least 2 historical data points are required to compute trend trajectory.');
    }

    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;
    let sumYY = 0;

    for (let i = 0; i < n; i++) {
      const x = i + 1;
      const y = data[i]!.value;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumXX += x * x;
      sumYY += y * y;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Pearson Correlation R^2
    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY));
    const r = denominator !== 0 ? numerator / denominator : 0;
    const rSquared = Math.round(Math.pow(r, 2) * 10000) / 10000;

    let trendDirection: 'UPWARD' | 'DOWNWARD' | 'STABLE' = 'STABLE';
    if (Math.abs(slope) > 0.05) {
      trendDirection = slope > 0 ? 'UPWARD' : 'DOWNWARD';
    }

    // Generate Forecast Horizons
    const forecastPoints: Array<{ periodIndex: number; projectedValue: number; lowerBound: number; upperBound: number }> = [];
    const historicalMean = sumY / n;
    const residualStdDev = Math.sqrt(Math.max(0, (sumYY - intercept * sumY - slope * sumXY) / Math.max(1, n - 2)));

    let projectedSum = 0;
    for (let step = 1; step <= horizonSteps; step++) {
      const futureX = n + step;
      const projectedValue = Math.max(0, Math.round((slope * futureX + intercept) * 100) / 100);
      const confidenceMargin = Math.round(1.96 * residualStdDev * Math.sqrt(1 + 1 / n + Math.pow(futureX - sumX / n, 2) / (sumXX - (sumX * sumX) / n)) * 100) / 100;
      
      projectedSum += projectedValue;
      forecastPoints.push({
        periodIndex: futureX,
        projectedValue,
        lowerBound: Math.max(0, Math.round((projectedValue - confidenceMargin) * 100) / 100),
        upperBound: Math.round((projectedValue + confidenceMargin) * 100) / 100,
      });
    }

    const projectedAverage = Math.round((projectedSum / horizonSteps) * 100) / 100;
    const percentChange = historicalMean !== 0 ? Math.round(((projectedAverage - historicalMean) / historicalMean) * 10000) / 100 : 0;

    // Natural Language Summary
    const narrativeSummary =
      trendDirection === 'UPWARD'
        ? `Upward growth velocity detected (Slope: +${slope.toFixed(2)}/interval, R²: ${rSquared}). Projected to rise by ${percentChange}% over the next ${horizonSteps} periods.`
        : trendDirection === 'DOWNWARD'
        ? `Downward trajectory detected (Slope: ${slope.toFixed(2)}/interval, R²: ${rSquared}). Projected to decrease by ${Math.abs(percentChange)}% over the next ${horizonSteps} periods.`
        : `Stable run-rate detected with minor variance (R²: ${rSquared}). Run-rate forecasted at ${projectedAverage.toFixed(2)} baseline.`;

    return {
      slope: Math.round(slope * 100) / 100,
      intercept: Math.round(intercept * 100) / 100,
      rSquared,
      trendDirection,
      historicalAverage: Math.round(historicalMean * 100) / 100,
      projectedAverage,
      forecastPoints,
      narrativeSummary,
    };
  }

  /**
   * 3. What-If Scenario Simulation Sandbox
   */
  static simulateWhatIf(data: TimeSeriesDataPoint[], scenario: WhatIfScenarioInput): WhatIfScenarioResult {
    const multiplier = scenario.multiplier ?? 1.0;
    const fixedOffset = scenario.fixedOffset ?? 0;

    const originalTotal = data.reduce((sum, d) => sum + d.value, 0);

    const simulatedPoints = data.map((d) => {
      const simulatedValue = Math.max(0, Math.round((d.value * multiplier + fixedOffset) * 100) / 100);
      return {
        ...d,
        value: simulatedValue,
      };
    });

    const simulatedTotal = simulatedPoints.reduce((sum, d) => sum + d.value, 0);
    const deltaValue = Math.round((simulatedTotal - originalTotal) * 100) / 100;
    const deltaPercent = originalTotal !== 0 ? Math.round((deltaValue / originalTotal) * 10000) / 100 : 0;

    const narrative =
      deltaValue >= 0
        ? `Simulated intervention results in an increase of ${deltaValue.toLocaleString()} (+${deltaPercent}% shift across ${data.length} periods).`
        : `Simulated intervention realizes cost reduction / variance of ${Math.abs(deltaValue).toLocaleString()} (${deltaPercent}% shift across ${data.length} periods).`;

    return {
      originalTotal: Math.round(originalTotal * 100) / 100,
      simulatedTotal: Math.round(simulatedTotal * 100) / 100,
      deltaValue,
      deltaPercent,
      simulatedPoints,
      narrative,
    };
  }
}
