import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { moduleDefaultRoles } from '@gigalibs/contracts';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import GigaOpsSectionPage from '../app/(app)/gigaops/[section]/page';
import { GIGAOPS_SECTIONS, isGigaOpsSection } from '../components/gigaops/sections';
import { timeActions } from '../components/gigaops/TimeAndAttendance';

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
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

  // WI-OI-120u Slice 3 (U20a; owner "retire all"): the WFO sections are retired.
  it('returns not found for the retired WFO sections', async () => {
    for (const section of ['workers', 'engagements', 'expenses', 'compliance', 'analytics']) {
      expect(isGigaOpsSection(section)).toBe(false);
      await expect(render(section)).rejects.toThrow('NEXT_NOT_FOUND');
    }
  });

  // WI-OI-120ah: one Time & Attendance screen, the real one; the old Clock & timesheets address redirects to it.
  it('redirects /gigaops/attendance to /gigaops/time and draws the real Time & Attendance screen', async () => {
    expect(isGigaOpsSection('attendance')).toBe(false);
    await expect(render('attendance')).rejects.toThrow('NEXT_REDIRECT /gigaops/time');
    const workbench = readFileSync(join(__dirname, '../components/gigaops/GigaOpsWorkforceWorkbench.tsx'), 'utf8');
    expect(workbench).not.toMatch(/PlantOperationsHub/);
    expect(workbench).toMatch(/section === 'time' \? \(\s*<TimeAndAttendance /);
  });

  // WI-OI-120ah: a technician lists their own submitted week and exceptions; they are not offered Approve, Resolve or
  // Void, which the server would refuse. The roles are the shipped defaults from the module manifests.
  it('offers approvals and corrections only to the roles the server allows them', () => {
    const role = (key: string) => {
      const found = moduleDefaultRoles.find((item) => item.key === key);
      if (!found) throw new Error(`no default role ${key}`);
      return found.permissions;
    };
    expect(timeActions(role('maintenance-technician'))).toEqual({ approve: false, manage: false });
    expect(timeActions(role('workforce-member'))).toEqual({ approve: false, manage: false });
    expect(timeActions(role('maintenance-planner'))).toEqual({ approve: true, manage: false });
    expect(timeActions(role('workforce-supervisor'))).toEqual({ approve: true, manage: true });
    expect(timeActions(['workforce.*'])).toEqual({ approve: true, manage: true });
    expect(timeActions(null)).toEqual({ approve: false, manage: false });
    const screen = readFileSync(join(__dirname, '../components/gigaops/TimeAndAttendance.tsx'), 'utf8');
    expect(screen).toMatch(/\{actions\.approve \? <Approvals \/> : null\}/);
    expect(screen).toMatch(/\{canManage \? <MissedPunch /);
  });

  it('returns not found for overview and unknown sections', async () => {
    expect(isGigaOpsSection('payroll')).toBe(false);
    await expect(render('overview')).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(render('payroll')).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
