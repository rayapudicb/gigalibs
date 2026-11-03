import { describe, expect, it } from 'vitest';
import { refusalMessage } from './module-analytics-bff.js';

describe('refusalMessage (WI-OI-146, QA-012)', () => {
  it('names the built-in roles that grant the refused module permission', () => {
    const message = refusalMessage({ code: 'ANALYTICS_SOURCE_PERMISSION', permission: 'cmms.analytics.read', message: 'refused' });
    expect(message).toMatch(/Maintenance planner/);
    expect(message).toMatch(/Maintenance viewer/);
    expect(message).not.toMatch(/cmms\.analytics\.read/);
  });

  it('keeps other refusals as the service wrote them', () => {
    expect(refusalMessage({ code: 'ANALYTICS_SOURCE_NOT_ENTITLED', message: 'Not in your plan.' })).toBe('Not in your plan.');
  });
});
