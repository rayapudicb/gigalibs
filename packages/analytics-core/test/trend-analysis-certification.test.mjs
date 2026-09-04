import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { UniversalTrendAnalysisEngine } from '../dist/index.js';

describe('📈 Universal Industry-Agnostic Trend Analysis Engine Certification', () => {
  it('1. Z-Score Anomaly Detection flags sudden spikes and drops across arbitrary data streams', () => {
    // E-Commerce product returns or SaaS cloud spend or Healthcare ER checkins
    const stream = [
      { timestamp: '2026-01-01', value: 100 },
      { timestamp: '2026-01-02', value: 105 },
      { timestamp: '2026-01-03', value: 98 },
      { timestamp: '2026-01-04', value: 102 },
      { timestamp: '2026-01-05', value: 350 }, // Massive Outlier Spike
      { timestamp: '2026-01-06', value: 99 },
      { timestamp: '2026-01-07', value: 101 },
    ];

    const anomalies = UniversalTrendAnalysisEngine.detectAnomalies(stream, 2.0);
    assert.equal(anomalies.length, 7);

    const spike = anomalies[4];
    assert.equal(spike.isAnomaly, true);
    assert.equal(spike.type, 'SPIKE');
    assert.ok(spike.zScore > 2.0);

    const normal = anomalies[0];
    assert.equal(normal.isAnomaly, false);
    assert.equal(normal.type, 'NORMAL');
  });

  it('2. Time-Series Trajectory Forecaster computes OLS slope, R² and forward projection', () => {
    const historicalSeries = [
      { timestamp: '2026-01', value: 1000 },
      { timestamp: '2026-02', value: 1200 },
      { timestamp: '2026-03', value: 1400 },
      { timestamp: '2026-04', value: 1600 },
      { timestamp: '2026-05', value: 1800 },
    ];

    const forecast = UniversalTrendAnalysisEngine.forecastTrajectory(historicalSeries, 3);
    assert.equal(forecast.trendDirection, 'UPWARD');
    assert.equal(forecast.slope, 200); // Perfectly linear slope of +$200/mo
    assert.equal(forecast.rSquared, 1.0); // 100% correlation
    assert.equal(forecast.forecastPoints.length, 3);
    assert.equal(forecast.forecastPoints[0].projectedValue, 2000); // Month 6 = 2000
    assert.equal(forecast.forecastPoints[1].projectedValue, 2200); // Month 7 = 2200
    assert.ok(forecast.narrativeSummary.includes('Upward growth velocity detected'));
  });

  it('3. What-If Scenario Sandbox models variable perturbation and delta shift', () => {
    const baseSpend = [
      { timestamp: '2026-Q1', value: 50000 },
      { timestamp: '2026-Q2', value: 60000 },
      { timestamp: '2026-Q3', value: 70000 },
    ];

    // Simulate 20% cost reduction policy
    const scenario = UniversalTrendAnalysisEngine.simulateWhatIf(baseSpend, { multiplier: 0.8 });
    assert.equal(scenario.originalTotal, 180000);
    assert.equal(scenario.simulatedTotal, 144000);
    assert.equal(scenario.deltaValue, -36000);
    assert.equal(scenario.deltaPercent, -20);
    assert.ok(scenario.narrative.includes('realizes cost reduction'));
  });
});
