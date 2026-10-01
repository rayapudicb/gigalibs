import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ReportsWorkbench } from '../components/analytics/reports/ReportsWorkbench';

describe('ReportsWorkbench (WI-OI-106)', () => {
  it('renders report creation controls with accessible format selection', () => {
    const html = renderToStaticMarkup(<ReportsWorkbench canWrite={true} canExport={true} />);

    // Renders creation form inputs
    expect(html).toContain('New report');
    expect(html).toContain('Name');
    expect(html).toContain('From');

    // Renders accessible format selection checkboxes
    expect(html).toContain('aria-label="Report formats"');
    expect(html).toContain('Formats');
    expect(html).toContain('CSV');
    expect(html).toContain('Excel');
    expect(html).toContain('PDF');
    expect(html).toContain('fresh CSV, Excel or PDF files');
  });

  it('omits creation controls when canWrite is false', () => {
    const html = renderToStaticMarkup(<ReportsWorkbench canWrite={false} canExport={true} />);
    expect(html).not.toContain('New report');
    expect(html).not.toContain('aria-label="Report formats"');
  });

  it('renders polite live region for status announcements and visible focus styles', () => {
    const html = renderToStaticMarkup(<ReportsWorkbench canWrite={true} canExport={true} />);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('focus-visible:ring-2');
  });
});
