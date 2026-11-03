import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// The test transform compiles JSX with the classic runtime.
vi.stubGlobal('React', React);
// next/link renders a plain anchor here; no router context is needed for a static render.
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href }, children),
}));

const { SetupWizard } = await import('../components/setup/SetupWizard');

// WI-OI-120 (T11b): the wizard reflects derived progress. In a static render the on-mount fetch has not run, so counts
// are 0 and progress rests on the session-derived props (company named, enabled modules).
describe('SetupWizard', () => {
  it('shows every step, the derived percent, and the next required step', () => {
    const html = renderToStaticMarkup(
      <SetupWizard companyName="North Industries" companyNamed={true} enabledModuleCount={0} />,
    );
    expect(html).toContain('Set up North Industries');
    // Seven steps are listed (WI-OI-153 adds "Confirm your country").
    for (const title of [
      'Name your company',
      'Confirm your country',
      'Set up your organization',
      'Invite your people',
      'Tailor roles &amp; access',
      'Choose your modules',
      'Apply a solution pack',
    ]) {
      expect(html).toContain(title);
    }
    // Company (auto-named) is the only done required step → 1 of 5 → 20%; the country is confirmed after the fetch.
    expect(html).toContain('20%');
    expect(html).toContain('Next step');
    expect(html).toContain('Checking your workspace');
  });

  it('counts enabled modules from the session toward progress', () => {
    const html = renderToStaticMarkup(
      <SetupWizard companyName="North" companyNamed={true} enabledModuleCount={3} />,
    );
    // Company + modules done of 5 required → 40%.
    expect(html).toContain('40%');
  });
});
