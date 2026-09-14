import { ConfigurationForm, toGigaFormEngineDocument } from '@gigalibs/configuration-react';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

describe('ConfigurationForm', () => {
  it('compiles governed fields into an action-free FormEngine presentation document', () => {
    const document = toGigaFormEngineDocument(
      {
        contractVersion: '1.0',
        moduleKey: 'tenant-apps',
        entityKey: 'inspection',
        surfaceKey: 'entry',
        mode: 'EDIT',
        title: 'Inspection',
        fields: [
          {
            key: 'status',
            label: 'Status',
            type: 'SELECT',
            component: 'select',
            required: true,
            readOnly: false,
            classification: 'INTERNAL',
            options: [{ label: 'Requires review', value: 'review' }],
          },
          {
            key: 'reason',
            label: 'Reason',
            type: 'TEXTAREA',
            component: 'textarea',
            required: false,
            readOnly: false,
            classification: 'INTERNAL',
            visibleWhen: {
              kind: 'PREDICATE',
              fieldKey: 'status',
              operator: 'EQUALS',
              value: 'review',
            },
          },
        ],
        sections: [
          { key: 'details', title: 'Details', columns: 2, fieldKeys: ['status', 'reason'] },
        ],
      },
      { status: 'review' },
    );

    const serialized = JSON.stringify(document);
    expect(document.form.children?.[0]?.children?.map((field) => field.key)).toEqual([
      'status',
      'reason',
    ]);
    expect(serialized).not.toContain('"actions"');
    expect(serialized).not.toContain('"events"');
    expect(serialized).not.toContain('"code"');
    expect(serialized).not.toContain('http://');
    expect(serialized).not.toContain('https://');
  });

  it('renders hostile metadata and values as escaped text rather than executable markup', () => {
    const html = renderToStaticMarkup(
      <ConfigurationForm
        definition={{
          contractVersion: '1.0',
          moduleKey: 'tenant-apps',
          entityKey: 'security-check',
          surfaceKey: 'security-form',
          mode: 'EDIT',
          title: 'Security check',
          fields: [
            {
              key: 'display-name',
              label: '<script>alert(1)</script>',
              helpText: '<img src=x onerror=alert(1)>',
              type: 'TEXT',
              component: 'text-input',
              required: false,
              readOnly: false,
              classification: 'INTERNAL',
            },
          ],
          sections: [
            {
              key: 'details',
              title: '<svg onload=alert(1)>',
              columns: 1,
              fieldKeys: ['display-name'],
            },
          ],
        }}
        values={{ 'display-name': '<script>window.pwned=true</script>' }}
        onChange={() => undefined}
      />,
    );
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<svg onload');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders visibility and requiredness from governed conditions', () => {
    const definition = {
      contractVersion: '1.0' as const,
      moduleKey: 'tenant-apps',
      entityKey: 'registration',
      surfaceKey: 'registration-form',
      mode: 'EDIT' as const,
      title: 'Registration',
      fields: [
        {
          key: 'industry',
          label: 'Industry',
          type: 'TEXT' as const,
          component: 'text-input' as const,
          required: false,
          readOnly: false,
          classification: 'INTERNAL' as const,
        },
        {
          key: 'license',
          label: 'License',
          type: 'TEXT' as const,
          component: 'text-input' as const,
          required: false,
          readOnly: false,
          classification: 'INTERNAL' as const,
          visibleWhen: {
            kind: 'PREDICATE' as const,
            fieldKey: 'industry',
            operator: 'EQUALS' as const,
            value: 'regulated',
          },
          requiredWhen: {
            kind: 'PREDICATE' as const,
            fieldKey: 'industry',
            operator: 'EQUALS' as const,
            value: 'regulated',
          },
        },
      ],
      sections: [
        { key: 'details', title: 'Details', columns: 1, fieldKeys: ['industry', 'license'] },
      ],
    };
    const hidden = renderToStaticMarkup(
      <ConfigurationForm
        definition={definition}
        values={{ industry: 'other' }}
        onChange={() => undefined}
      />,
    );
    const shown = renderToStaticMarkup(
      <ConfigurationForm
        definition={definition}
        values={{ industry: 'regulated' }}
        onChange={() => undefined}
      />,
    );
    expect(hidden).not.toContain('License');
    expect(shown).toContain('License');
    expect(shown).toContain('required=""');
  });

  it('renders ConfigurationDetailView in READ mode with escaped values and masking', async () => {
    const { ConfigurationDetailView } = await import('@gigalibs/configuration-react');
    const readDef = {
      contractVersion: '1.0' as const,
      moduleKey: 'tenant-apps',
      entityKey: 'profile',
      surfaceKey: 'detail',
      mode: 'READ' as const,
      title: 'Profile Detail',
      fields: [
        {
          key: 'taxpayer-id',
          label: 'Taxpayer ID',
          type: 'TEXT' as const,
          component: 'text-input' as const,
          required: false,
          readOnly: true,
          classification: 'RESTRICTED' as const,
        },
        {
          key: 'company-name',
          label: 'Company Name',
          type: 'TEXT' as const,
          component: 'text-input' as const,
          required: true,
          readOnly: true,
          classification: 'PUBLIC' as const,
        },
      ],
      sections: [
        {
          key: 'org',
          title: 'Organization Overview',
          columns: 2,
          fieldKeys: ['company-name', 'taxpayer-id'],
        },
      ],
    };

    const html = renderToStaticMarkup(
      <ConfigurationDetailView
        definition={readDef}
        values={{ 'company-name': 'Acme Global Corp', 'taxpayer-id': '98-7654321' }}
      />,
    );

    expect(html).toContain('Acme Global Corp');
    expect(html).toContain('•••• 4321');
    expect(html).toContain('RESTRICTED');
  });

  it('renders ConfigurationListView in LIST mode with table headers and row cells', async () => {
    const { ConfigurationListView } = await import('@gigalibs/configuration-react');
    const listDef = {
      contractVersion: '1.0' as const,
      moduleKey: 'tenant-apps',
      entityKey: 'vendors',
      surfaceKey: 'vendor-list',
      mode: 'LIST' as const,
      title: 'Vendor Registry',
      fields: [
        {
          key: 'vendor-code',
          label: 'Vendor Code',
          type: 'TEXT' as const,
          component: 'text-input' as const,
          required: true,
          readOnly: true,
          classification: 'INTERNAL' as const,
        },
        {
          key: 'vendor-name',
          label: 'Vendor Name',
          type: 'TEXT' as const,
          component: 'text-input' as const,
          required: true,
          readOnly: true,
          classification: 'INTERNAL' as const,
        },
      ],
      sections: [
        {
          key: 'cols',
          title: 'Columns',
          columns: 1,
          fieldKeys: ['vendor-code', 'vendor-name'],
        },
      ],
    };

    const html = renderToStaticMarkup(
      <ConfigurationListView
        definition={listDef}
        records={[
          { 'vendor-code': 'VEND-001', 'vendor-name': 'AWS Cloud' },
          { 'vendor-code': 'VEND-002', 'vendor-name': 'Oracle Corp' },
        ]}
      />,
    );

    expect(html).toContain('Vendor Code');
    expect(html).toContain('Vendor Name');
    expect(html).toContain('VEND-001');
    expect(html).toContain('AWS Cloud');
    expect(html).toContain('VEND-002');
    expect(html).toContain('Oracle Corp');
  });
});
