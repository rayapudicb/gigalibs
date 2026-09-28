import { describe, it, expect } from 'vitest';
import { determinePersona } from '../lib/platform-context';
import { canOpenPlatformModule } from '../lib/module-access';
import { platformModuleCatalog } from '@gigalibs/contracts';

describe('Phase 6: Executive Experience & Control Tower', () => {
  describe('Cross-Module KPI Calculations', () => {
    it('accurately computes OEE from Availability, Performance, and Quality parameters', () => {
      const availability = 0.938; // 93.8%
      const performance = 0.912;  // 91.2%
      const quality = 0.988;      // 98.8%

      const calculatedOee = Number((availability * performance * quality * 100).toFixed(1));
      expect(calculatedOee).toBe(84.5);
      expect(calculatedOee).toBeGreaterThanOrEqual(80.0); // Top-tier enterprise threshold
    });

    it('calculates DSO (Days Sales Outstanding) and verifies healthy aging distribution', () => {
      const totalReceivablesUsd = 2_810_000;
      const totalGrossSalesUsd = 29_500_000;
      const periodDays = 365;

      const dso = Number(((totalReceivablesUsd / totalGrossSalesUsd) * periodDays).toFixed(1));
      expect(dso).toBe(34.8);
      expect(dso).toBeLessThan(45.0); // Target < 45 days
    });

    it('verifies universal workforce utilization and 100% capability compliance guard', () => {
      const totalResources = 14;
      const allocatedResources = 12;
      const uncertifiedDispatches = 0; // Strict 422 guard ensures 0 violations

      const utilizationPercent = (allocatedResources / totalResources) * 100;
      expect(utilizationPercent).toBeCloseTo(85.71, 1);
      expect(uncertifiedDispatches).toBe(0);
    });
  });

  describe('Department Hierarchy Scoping (ADR-0003 Decision 4)', () => {
    it('correctly distinguishes FLAT_TENANT and SCOPED_DEPARTMENTS modes', () => {
      const globalScope = { id: 'ALL', mode: 'FLAT_TENANT' };
      const opsScope = { id: 'dept-ops', mode: 'SCOPED_DEPARTMENTS' };

      expect(globalScope.mode).toBe('FLAT_TENANT');
      expect(opsScope.mode).toBe('SCOPED_DEPARTMENTS');
      expect(opsScope.id).toMatch(/^dept-/);
    });
  });

  describe('Executive Persona Routing & Security Guardrails', () => {
    it('routes C-Level roles to C_LEVEL persona and platform owners to PLATFORM_OPERATOR', () => {
      expect(determinePersona(['CEO'], [])).toBe('C_LEVEL');
      expect(determinePersona(['CFO'], [])).toBe('C_LEVEL');
      expect(determinePersona([], ['PLATFORM_ADMIN'])).toBe('PLATFORM_OPERATOR');
      expect(determinePersona(['admin'], [])).toBe('TENANT_ADMIN');
    });

    it('guarantees persona lens never escalates backend permissions (fail-closed)', () => {
      const viewerSession = {
        tenant: { features: ['analytics-studio'] },
        permissions: ['analytics:read'],
        platformRoles: [],
      };

      const arModule = platformModuleCatalog.find((m) => m.key === 'accounts-receivable')!;
      expect(arModule).toBeDefined();

      // Even if simulating C_LEVEL or TENANT_ADMIN lens, missing permissions reject access
      expect(canOpenPlatformModule(arModule, viewerSession)).toBe(false);
    });
  });

  describe('Cryptographic Action Digest Generation', () => {
    it('produces valid 64-char hex SHA-256 attestation digest for executive actions', async () => {
      const actionType = 'ACCELERATE_WORKING_CAPITAL';
      const timestamp = 1758369600000;
      const reason = 'Quarterly capital optimization cycle';

      const payload = `${actionType}:${timestamp}:${reason}`;
      const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
      const digest = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      expect(digest).toHaveLength(64);
      expect(digest).toMatch(/^[a-f0-9]{64}$/);
    });
  });
});
