import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import GigaOpsSectionPage from '../app/(app)/gigaops/[section]/page';
import { GIGAOPS_SECTIONS, isGigaOpsSection } from '../components/gigaops/sections';

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

// The test transform compiles route JSX with the classic runtime.
vi.stubGlobal('React', React);

const render = (section: string) => GigaOpsSectionPage({ params: Promise.resolve({ section }) });

describe('GigaOps section route', () => {
  it('keeps the shared section list outside the client boundary', () => {
    // A server route importing runtime values from a 'use client' module receives a
    // client reference instead of the array, which crashed every section page.
    const source = readFileSync(join(__dirname, '../components/gigaops/sections.ts'), 'utf8');
    expect(source).not.toMatch(/^\s*['"]use client['"]/m);
  });

  it('renders every non-overview section', async () => {
    for (const section of GIGAOPS_SECTIONS.filter((item) => item !== 'overview')) {
      await expect(render(section)).resolves.toMatchObject({ props: { section } });
    }
  });

  it('returns not found for overview and unknown sections', async () => {
    expect(isGigaOpsSection('payroll')).toBe(false);
    await expect(render('overview')).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(render('payroll')).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
