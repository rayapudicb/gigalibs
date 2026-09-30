import { describe, expect, it } from 'vitest';
import { EMPTY_PULL_SOURCE_FORM, credentialFields, formFromSource, sourceFromForm } from '../lib/connectors/pull-source-form';

// WI-OI-104d: the pull-source form round-trips a stored source and sends only the chosen paging style and login.
describe('pull source form', () => {
  it('builds a farmOS-style JSON:API source and reads it back', () => {
    const source = sourceFromForm({
      ...EMPTY_PULL_SOURCE_FORM,
      baseUrl: ' https://farm.example ',
      resourcePath: '/api/log/harvest',
      query: 'filter[changed][operator]=>=\n\n filter[status]=done ',
      recordsPath: 'data',
      watermarkField: 'attributes.changed',
      watermarkParam: 'filter[changed][value]',
      watermarkFormat: 'epoch-seconds',
      pagingStyle: 'next-link',
      loginKind: 'oauth2-client-credentials',
      tokenUrl: 'https://farm.example/oauth/token',
      clientAuth: 'body',
      scope: 'farm_manager',
    });
    expect(source).toEqual({
      baseUrl: 'https://farm.example',
      resourcePath: '/api/log/harvest',
      query: { 'filter[changed][operator]': '>=', 'filter[status]': 'done' },
      recordsPath: 'data',
      idField: 'id',
      watermark: { field: 'attributes.changed', param: 'filter[changed][value]', format: 'epoch-seconds' },
      paging: { style: 'next-link', nextLinkPath: 'links.next' },
      auth: { kind: 'oauth2-client-credentials', tokenUrl: 'https://farm.example/oauth/token', clientAuth: 'body', scope: 'farm_manager' },
      maxPages: 50,
    });
    expect(sourceFromForm(formFromSource(source))).toEqual(source);
  });

  it('sends page settings only for page paging, and asks for the secrets each login needs', () => {
    const source = sourceFromForm({ ...EMPTY_PULL_SOURCE_FORM, baseUrl: 'https://api.example', pagingStyle: 'page', size: '25', loginKind: 'api-key', apiKeyIn: 'query', apiKeyName: 'key' });
    expect(source.paging).toEqual({ style: 'page', pageParam: 'page', sizeParam: 'per_page', size: 25, firstPage: 1 });
    expect(source.auth).toEqual({ kind: 'api-key', in: 'query', name: 'key' });
    expect(source).not.toHaveProperty('watermark');
    expect(Number.isNaN((sourceFromForm({ ...EMPTY_PULL_SOURCE_FORM, pagingStyle: 'offset', size: 'ten' }).paging as { size: number }).size)).toBe(true);
    expect(credentialFields('oauth2-client-credentials').map((field) => field.key)).toEqual(['clientId', 'clientSecret']);
    expect(credentialFields('none')).toEqual([]);
    expect(formFromSource(undefined)).toEqual(EMPTY_PULL_SOURCE_FORM);
  });
});
