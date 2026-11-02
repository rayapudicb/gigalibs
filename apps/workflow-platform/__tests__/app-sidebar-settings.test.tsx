/**
 * WI-OI-145 — the daily sidebar holds the business modules; administration, integration and automation tools sit in
 * the Settings sidebar, which replaces it on their routes. Solution Packs appears nowhere, the AP-only approval queue
 * sits in Finance, the Executive Control Tower is for executives and administrators, and someone who can switch
 * persona sees one switcher instead of a badge and a select that overflowed the sidebar.
 */
import { platformModuleCatalog } from '@gigalibs/contracts';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import AppSidebar from '../components/AppSidebar';
import type { VerifiedSession } from '../lib/verified-session';

// vitest compiles JSX with the classic runtime and AppSidebar does not import React, so the renderer needs it global.
(globalThis as { React?: typeof React }).React = React;

let pathname = '/modules';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));
vi.mock('@/components/i18n', () => ({
  useTranslation: () => ({
    t: (key: string) => ({ home: 'Home', settings: 'Settings' })[key as 'home' | 'settings'] ?? key,
  }),
}));

const permissions = [
  ...new Set(platformModuleCatalog.flatMap((module) => (module.requiredPermission ? [module.requiredPermission] : []))),
  'tenant:read',
  'users:read',
];

function session(roles: string[], platformRoles: string[] = []): VerifiedSession {
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
    platformRoles,
    permissions,
    session: { id: 's1', expiresAt: '2026-11-03T00:00:00.000Z' },
    authVersion: 1,
    orgScope: { mode: 'FLAT_TENANT' },
    spatialScope: { mode: 'UNBOUNDED' },
  } as unknown as VerifiedSession;
}

function render(at: string, who: VerifiedSession): string {
  pathname = at;
  return renderToStaticMarkup(<AppSidebar session={who} uatPreview />);
}

const hrefs = (markup: string) => new Set([...markup.matchAll(/href="([^"]+)"/g)].map((match) => match[1]!.replace(/&amp;/g, '&')));

describe('daily sidebar and Settings sidebar (WI-OI-145)', () => {
  it('keeps administration tools out of the daily sidebar of an administrator', () => {
    const links = hrefs(render('/modules', session(['TENANT_ADMIN'])));
    for (const daily of ['/modules', '/dashboard', '/cmms', '/inventory', '/finance', '/analytics', '/actions', '/ap'])
      expect(links, daily).toContain(daily);
    for (const settings of ['/runs', '/exceptions', '/workflows', '/configuration', '/connections', '/connections/oauth-studio',
      '/settings/profile', '/settings/organization', '/platform-admin'])
      expect(links, settings).not.toContain(settings);
    expect(links, 'Settings link').toContain('/settings');
    expect(links, 'Solution Packs').not.toContain('/solutions');
  });

  it('shows the Settings sidebar, sectioned, on a Settings route', () => {
    const markup = render('/runs', session(['TENANT_ADMIN']));
    const links = hrefs(markup);
    for (const settings of ['/settings', '/settings/people', '/settings/organization', '/settings/plan', '/settings/general',
      '/settings/security', '/connections/oauth-studio', '/connections', '/connections/credentials', '/workflows',
      '/workflows/templates', '/configuration', '/runs', '/exceptions', '/settings/profile'])
      expect(links, settings).toContain(settings);
    // Modules & plan only redirects to Plan & entitlements, so it is not listed twice.
    expect(links, 'Modules & plan').not.toContain('/marketplace');
    expect(links, 'back to Home').toContain('/modules');
    for (const daily of ['/cmms', '/inventory', '/finance', '/actions', '/solutions']) expect(links, daily).not.toContain(daily);
    const order = ['Workspace', 'Integrations', 'Automation', 'Account'].map((section) => markup.indexOf(`>${section}<`));
    expect(order.every((at) => at > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    for (const label of ['Team &amp; access', 'Organization &amp; hierarchy', 'Connected apps', 'Run history',
      'Processing exceptions', 'Forms &amp; apps', 'My profile &amp; security'])
      expect(markup).toContain(label);
  });

  it('gives a supervisor the approvals but no diagnostics, no control tower, and Settings at their profile', () => {
    const who = session(['SUPERVISOR']);
    const daily = hrefs(render('/modules', who));
    expect(daily).toContain('/actions');
    expect(daily).not.toContain('/dashboard');
    expect(daily).toContain('/settings/profile');
    const settings = hrefs(render('/settings/profile', who));
    for (const hidden of ['/runs', '/exceptions', '/workflows', '/settings', '/marketplace'])
      expect(settings, hidden).not.toContain(hidden);
  });

  it('gives a technician no approval queue', () => {
    const links = hrefs(render('/modules', session(['TECHNICIAN'])));
    expect(links).not.toContain('/actions');
    expect(links).not.toContain('/dashboard');
    expect(links).toContain('/settings/profile');
  });

  it('shows a platform operator one persona switcher and Platform Control Tower in Settings', () => {
    const operator = session(['TENANT_ADMIN'], ['PLATFORM_OWNER']);
    const daily = render('/modules', operator);
    expect(daily).toContain('My view: Platform Operator');
    expect(daily).not.toContain('Operator</span>');
    expect(hrefs(render('/platform-admin', operator))).toContain('/platform-admin');
  });
});
