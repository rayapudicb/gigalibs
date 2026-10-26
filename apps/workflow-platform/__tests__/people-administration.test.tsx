import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// The test transform compiles JSX with the classic runtime.
vi.stubGlobal('React', React);

const { PeopleAdministration } = await import('../components/settings/PeopleAdministration');

// WI-OI-120p (S17): the People console shows only the sections the member is allowed to use — bulk invite / tracker /
// grant need people:manage (a delegated head), the tracker alone needs people:read, off-boarding needs users:update.
describe('PeopleAdministration — permission gating', () => {
  it('tells a member with no people permissions that administration is delegated, and shows no tools', () => {
    const html = renderToStaticMarkup(<PeopleAdministration permissions={[]} />);
    expect(html).toContain('delegated');
    expect(html).not.toContain('Invite people in bulk');
    expect(html).not.toContain('Off-board people in bulk');
  });

  it('shows invite, tracker and grant to a head who holds people:manage', () => {
    const html = renderToStaticMarkup(<PeopleAdministration permissions={['people:manage']} />);
    expect(html).toContain('Invite people in bulk');
    expect(html).toContain('Join tracker');
    expect(html).toContain('Grant roles to existing people');
    // A head is not necessarily an administrator, so off-boarding does not show without users:update.
    expect(html).not.toContain('Off-board people in bulk');
  });

  it('shows the tracker (read-only, no resend/revoke bar) to a member who only holds people:read', () => {
    const html = renderToStaticMarkup(<PeopleAdministration permissions={['people:read']} />);
    expect(html).toContain('Join tracker');
    expect(html).not.toContain('Invite people in bulk');
    expect(html).not.toContain('Grant roles to existing people');
  });

  it('shows bulk off-boarding to an administrator who holds users:update', () => {
    const html = renderToStaticMarkup(<PeopleAdministration permissions={['users:update']} />);
    expect(html).toContain('Off-board people in bulk');
    expect(html).not.toContain('Invite people in bulk');
  });

  it('gives a workspace admin with a wildcard everything', () => {
    const html = renderToStaticMarkup(<PeopleAdministration permissions={['*']} />);
    expect(html).toContain('Invite people in bulk');
    expect(html).toContain('Grant roles to existing people');
    expect(html).toContain('Off-board people in bulk');
  });
});
