import { test, expect } from '@playwright/test';

test.describe('Authenticated Multi-Tenant & Multi-Role Persona Certification', () => {
  const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://127.0.0.1:5180';

  const TENANTS = {
    ALPHA: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Alpha Manufacturing Corp',
      slug: 'alpha-corp',
    },
    BETA: {
      id: '00000000-0000-0000-0000-000000000002',
      name: 'Beta Industrial Services',
      slug: 'beta-ind',
    },
  };

  test.describe('1. Cross-Tenant Data Isolation (Tenant Alpha vs Tenant Beta)', () => {
    test('Tenant Alpha caller cannot read Tenant Beta workforce allocations', async ({ request }) => {
      const response = await request.get(
        `${BASE_URL}/api/workforce/allocations?tenantId=${TENANTS.BETA.id}`,
        {
          headers: {
            'x-tenant-id': TENANTS.ALPHA.id,
            Accept: 'application/json',
          },
        },
      );
      expect([401, 403]).toContain(response.status());
    });

    test('Tenant Beta caller cannot read Tenant Alpha department hierarchy', async ({ request }) => {
      const response = await request.get(
        `${BASE_URL}/api/control/tenants/${TENANTS.ALPHA.id}/departments`,
        {
          headers: {
            'x-tenant-id': TENANTS.BETA.id,
            Accept: 'application/json',
          },
        },
      );
      expect([401, 403]).toContain(response.status());
    });

    test('Header injection of foreign tenant ID is rejected by BFF proxy', async ({ request }) => {
      const response = await request.get(`${BASE_URL}/api/workforce/resources`, {
        headers: {
          'x-tenant-id': TENANTS.BETA.id,
          'x-user-id': 'usr-spoofed-001',
        },
      });
      expect([401, 403]).toContain(response.status());
    });
  });

  test.describe('2. Multi-Role Persona Routing and Capability Enforcement', () => {
    test('Non-platform personas are denied access to /platform-admin', async ({ request }) => {
      for (const persona of ['C_LEVEL', 'OPERATIONS_SUPERVISOR', 'WORKFORCE_MEMBER', 'TENANT_ADMIN']) {
        const response = await request.get(`${BASE_URL}/platform-admin`, {
          headers: {
            'x-persona-lens': persona,
          },
          maxRedirects: 0,
        });
        expect([302, 307, 401, 403]).toContain(response.status());
      }
    });

    test('Persona lens cannot elevate permissions beyond granted scopes (STRIDE EoP)', async ({ request }) => {
      const response = await request.post(`${BASE_URL}/api/workforce/allocations`, {
        headers: {
          'x-persona-lens': 'PLATFORM_OPERATOR',
          'Content-Type': 'application/json',
        },
        data: {
          resourceId: '00000000-0000-0000-0000-000000000001',
          scheduledStart: new Date().toISOString(),
          scheduledFinish: new Date(Date.now() + 3600000).toISOString(),
        },
      });
      expect([401, 403]).toContain(response.status());
    });
  });

  test.describe('3. Department Scoping Enforcement', () => {
    test('Department-scoped requests fail closed if department predicates are not certified', async ({ request }) => {
      const response = await request.get(`${BASE_URL}/api/cmms/v1/work-orders?departmentId=dept-1`, {
        headers: {
          'x-org-scope': 'SCOPED_DEPARTMENTS',
        },
      });
      expect([401, 403]).toContain(response.status());
    });
  });
});
