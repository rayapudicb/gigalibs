import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ModuleWindowWorkspace } from '@gigalibs/configuration-react';
import { generatedModuleGateways } from '../lib/generated/module-gateways';

// The Universal Business Partner page posted to `v1/records`, which the module stopped serving when its record
// dispatcher arrived ("Cannot POST /business-partners/v1/records"). The page is now the Partners metadata window over
// the SDK record routes, and the gateway forwards those routes instead of the placeholder ones.
const ID = '6d3f1a52-7f5b-4f2a-9a61-1f0b8c1d2e3f';
const gateway = generatedModuleGateways['business-partners']!;
const forwards = (path: string, method: string) =>
  gateway.routes.some((route) => new RegExp(route.pattern).test(path) && method in route.methods);

describe('Universal Business Partner page', () => {
  it('forwards the record routes the Partners window calls', () => {
    expect(forwards('v1/records/business-partners.partners', 'GET')).toBe(true);
    expect(forwards(`v1/records/business-partners.partners/${ID}`, 'GET')).toBe(true);
    expect(forwards('v1/lookups/party-type', 'GET')).toBe(true);
  });

  it('no longer forwards the placeholder routes the module does not serve', () => {
    expect(forwards('v1/records', 'POST')).toBe(false);
    expect(forwards('v1/records', 'GET')).toBe(false);
    expect(forwards(`v1/records/${ID}`, 'PATCH')).toBe(false);
  });

  it('renders the page heading while the published window loads', () => {
    const html = renderToStaticMarkup(
      <ModuleWindowWorkspace moduleKey="business-partners" entityKey="partners" surfaceKey="partners"
        basePath="/api/business-partners" title="Universal Business Partner" permissions={['business-partners:read']} />,
    );
    expect(html).toContain('Universal Business Partner');
    expect(html).toContain('Loading the window');
  });
});
