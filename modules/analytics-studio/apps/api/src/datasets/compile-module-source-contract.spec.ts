import { describe, expect, it } from 'vitest';
import { generatedModuleAnalyticsSources } from '@gigalibs/contracts';
import { compileModuleSourceContract } from './compile-module-source-contract.js';

describe('compileModuleSourceContract', () => {
  it('builds mappings and measures for CMMS downtime', () => {
    const contract = generatedModuleAnalyticsSources.find((entry) => entry.sourceKey === 'cmms-downtime')!;
    const compiled = compileModuleSourceContract(contract);
    expect(compiled.sourceTableName).toBe('cmms_downtime_facts');
    expect(compiled.measures.some((measure) => measure.measureName === 'downtime_minutes')).toBe(true);
    expect(compiled.manifest.reversalFields).toContain('duration_minutes');
  });
});
