/**
 * WI-OI-120 (U28a): signing in to the UAT instance as the owner's tenant administrator, for the walk-through specs.
 *
 * E2E_UAT_ADMIN_EMAIL / E2E_UAT_ADMIN_PASSWORD: the login (the run script asks for it; it is never stored or printed).
 * E2E_UAT_TENANT: the tenant to work in when the login belongs to several (default "GigaLibs Global Enterprise").
 */
import { expect, type Page } from '@playwright/test';

export const uatAdmin = {
  email: process.env.E2E_UAT_ADMIN_EMAIL ?? '',
  password: process.env.E2E_UAT_ADMIN_PASSWORD ?? '',
};
export const uatTenantName = process.env.E2E_UAT_TENANT ?? 'GigaLibs Global Enterprise';
export const hasUatLogin = Boolean(uatAdmin.email && uatAdmin.password);

/** Signs the page's browser context in, choosing the UAT tenant when the login has several. */
export async function signInToUat(page: Page, origin: string): Promise<void> {
  const login = await page.request.post('/api/auth/login', { data: uatAdmin, headers: { Origin: origin } });
  expect(login.status(), `Sign-in failed: ${await login.text()}`).toBe(200);
  const answer = (await login.json()) as { requiresTenantSelection?: boolean; requiresMfa?: boolean };
  if (answer.requiresMfa) throw new Error('This login asks for MFA; use a UAT tenant administrator without MFA for the walk-through.');
  if (!answer.requiresTenantSelection) return;
  const tenantsResponse = await page.request.get('/api/auth/tenants');
  expect(tenantsResponse.status(), await tenantsResponse.text()).toBe(200);
  const body: unknown = await tenantsResponse.json();
  const tenants = (Array.isArray(body) ? body : ((body as { items?: unknown[]; tenants?: unknown[] }).items ?? (body as { tenants?: unknown[] }).tenants ?? [])) as {
    id?: string;
    name?: string;
    slug?: string;
    tenant?: { id?: string; name?: string; slug?: string };
  }[];
  const wanted = uatTenantName.toLowerCase();
  const match = tenants.map((entry) => entry.tenant ?? entry).find((tenant) => tenant.name?.toLowerCase() === wanted || tenant.slug?.toLowerCase() === wanted);
  if (!match?.id) throw new Error(`The login has no tenant named "${uatTenantName}" (set E2E_UAT_TENANT).`);
  const selected = await page.request.post('/api/auth/select-tenant', { data: { tenantId: match.id }, headers: { Origin: origin } });
  expect(selected.status(), await selected.text()).toBe(200);
}
