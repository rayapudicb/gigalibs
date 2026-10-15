import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

let pathname = '/communications';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));
// The test transform compiles JSX with the classic runtime.
vi.stubGlobal('React', React);

const { ModuleAccessGate } = await import('../components/navigation/ModuleAccessGate');

// WI-OI-120ak (S5b): an unreleased module is "not available yet", not "not in your plan" or "your role".
describe('module access gate', () => {
  const access = {
    tenant: { features: [] as string[] },
    permissions: ['*'],
    platformRoles: [] as string[],
    uatPreview: true,
  };

  it('says a contained module is not available yet, with no plan link', () => {
    pathname = '/communications';
    const html = renderToStaticMarkup(<ModuleAccessGate access={access}>secret</ModuleAccessGate>);
    expect(html).toContain('is not available yet');
    expect(html).not.toContain('not in your plan');
    expect(html).not.toContain('Plan &amp; Entitlements');
    expect(html).not.toContain('secret');
  });

  // Security review of f6123bf (L1): the UAT preview opens PLANNED modules, so there the plan is what is missing.
  it('says a planned module is not in the plan on the UAT preview, and not available yet elsewhere', () => {
    pathname = '/inventory';
    const onUat = renderToStaticMarkup(<ModuleAccessGate access={access}>secret</ModuleAccessGate>);
    expect(onUat).toContain('not in your plan');
    expect(onUat).not.toContain('is not available yet');
    const elsewhere = renderToStaticMarkup(
      <ModuleAccessGate access={{ ...access, uatPreview: false }}>secret</ModuleAccessGate>,
    );
    expect(elsewhere).toContain('is not available yet');
    expect(elsewhere).not.toContain('secret');
  });

  it('still says a released module the workspace lacks is not in its plan', () => {
    pathname = '/gigaops';
    const html = renderToStaticMarkup(<ModuleAccessGate access={access}>secret</ModuleAccessGate>);
    expect(html).toContain('not in your plan');
    expect(html).not.toContain('secret');
  });
});
