/**
 * WI-OI-152 (ADR-0037 §3): the Master data area sits in the daily sidebar for administrators, with one link per group
 * they can read; a frontline worker keeps reaching their masters from the module itself.
 */
import { platformModuleCatalog } from '@gigalibs/contracts';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import AppSidebar from '../components/AppSidebar';
import type { VerifiedSession } from '../lib/verified-session';

(globalThis as { React?: typeof React }).React = React;

vi.mock('next/navigation', () => ({ usePathname: () => '/modules' }));
vi.mock('@/components/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => ({ home: 'Home', settings: 'Settings' })[key as 'home' | 'settings'] ?? key }),
}));

function session(roles: string[], permissions: string[]): VerifiedSession {
  return {
    user: { id: 'u1', email: 'person@example.test', name: 'Person', status: 'ACTIVE' },
    tenant: {
      id: 't1',
      name: 'Acme Plant',
      slug: 'acme',
      status: 'ACTIVE',
      trialEndsAt: null,
      features: platformModuleCatalog.map((module) => module.key),
      entitlements: [],
    },
    roles,
    platformRoles: [],
    permissions,
    session: { id: 's1', expiresAt: '2026-11-03T00:00:00.000Z' },
    authVersion: 1,
    orgScope: { mode: 'FLAT_TENANT' },
    spatialScope: { mode: 'UNBOUNDED' },
  } as unknown as VerifiedSession;
}

const hrefs = (markup: string) => [...markup.matchAll(/href="(\/master-data[^"]*)"/g)].map((match) => match[1]);

describe('Master data area in the sidebar (WI-OI-152)', () => {
  it('gives an administrator one link per group they can read, after "All masters"', () => {
    const markup = renderToStaticMarkup(
      <AppSidebar session={session(['TENANT_ADMIN'], ['products:read', 'inventory:read', 'finance:read', 'tenant:read'])} uatPreview />,
    );
    expect(markup).toContain('Master data');
    expect(hrefs(markup)).toEqual(['/master-data', '/master-data/products-and-stock', '/master-data/finance']);
  });

  it('shows nothing to an administrator who can read no master', () => {
    const markup = renderToStaticMarkup(<AppSidebar session={session(['TENANT_ADMIN'], ['tenant:read'])} uatPreview />);
    expect(hrefs(markup)).toEqual([]);
  });

  it('leaves the area out for a frontline worker, who reaches masters from the module', () => {
    const markup = renderToStaticMarkup(<AppSidebar session={session(['MEMBER'], ['workforce:read'])} uatPreview />);
    expect(hrefs(markup)).toEqual([]);
  });
});
