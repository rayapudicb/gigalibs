'use client';

import type { OrgUnitTypeV1 } from '@gigalibs/contracts';
import { Container, Heading, Text } from '@medusajs/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { requestJson } from '@/lib/client-api';
import { describeOrgError, orgPermissions, orgRequest, type OrgErrorView } from './organization-client';
import { OrgAccessPanel } from './OrgAccessPanel';
import { OrgErrorAlert } from './OrgShared';
import { OrgStructurePanel } from './OrgStructurePanel';
import { OrgUnitTypesPanel } from './OrgUnitTypesPanel';
import { type OrgMember, OrgUnitsPanel } from './OrgUnitsPanel';

type Section = 'structure' | 'units' | 'types' | 'access';
const SECTIONS: Array<{ key: Section; label: string }> = [
  { key: 'structure', label: 'Structure' },
  { key: 'units', label: 'Units' },
  { key: 'types', label: 'Unit types' },
  { key: 'access', label: 'Access' },
];

/** WI-OI-109d (ADR-0018): organization administration on the governed hierarchy APIs. */
export function OrganizationAdministration({ grantedPermissions, userId }: { grantedPermissions: readonly string[]; userId: string }) {
  const permissions = useMemo(() => orgPermissions(grantedPermissions), [grantedPermissions]);
  const [section, setSection] = useState<Section>('structure');
  const [unitTypes, setUnitTypes] = useState<OrgUnitTypeV1[] | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [error, setError] = useState<OrgErrorView | null>(null);

  const loadShared = useCallback(async () => {
    setError(null);
    try {
      setUnitTypes(await orgRequest<OrgUnitTypeV1[]>('/unit-types'));
    } catch (caught) {
      setError(describeOrgError(caught));
    }
    // Member names are a convenience; screens fall back to ids when the member list is not readable.
    requestJson<OrgMember[]>('/api/control/tenants/current/members').then(setMembers).catch(() => setMembers([]));
  }, []);

  useEffect(() => {
    if (permissions.read) void loadShared();
  }, [permissions.read, loadShared]);

  const userNames = useMemo(
    () => Object.fromEntries(members.map((member) => [member.user.id, member.user.name ?? member.user.email])),
    [members],
  );

  if (!permissions.read)
    return (
      <Container className="p-6">
        <Heading level="h2">Organization</Heading>
        <Text size="small" className="text-ui-fg-subtle">Viewing the organization needs the organization:read permission. Ask a tenant administrator.</Text>
      </Container>
    );

  return (
    <section className="flex flex-col gap-4" aria-labelledby="organization-heading">
      <div className="flex flex-col gap-1">
        <Heading level="h2" id="organization-heading">Organization</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Your own levels, units and tree. Changes go through a draft that a second person approves, and take effect only when activated.
        </Text>
      </div>
      <div role="tablist" aria-label="Organization sections" className="flex flex-wrap gap-1 border-b border-ui-border-base">
        {SECTIONS.map((item) => (
          <button
            key={item.key}
            id={`organization-tab-${item.key}`}
            type="button"
            role="tab"
            aria-selected={section === item.key}
            aria-controls={`organization-panel-${item.key}`}
            onClick={() => setSection(item.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm focus:outline-none focus-visible:shadow-borders-focus ${
              section === item.key ? 'border-ui-fg-base text-ui-fg-base' : 'border-transparent text-ui-fg-subtle hover:text-ui-fg-base'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <OrgErrorAlert error={error} onRetry={() => void loadShared()} onReload={() => void loadShared()} />
      <div role="tabpanel" id={`organization-panel-${section}`} aria-labelledby={`organization-tab-${section}`}>
        {section === 'structure' && <OrgStructurePanel permissions={permissions} userId={userId} userNames={userNames} onChanged={() => void loadShared()} />}
        {section === 'units' && (unitTypes ? <OrgUnitsPanel unitTypes={unitTypes} members={members} permissions={permissions} /> : <Loading />)}
        {section === 'types' && (unitTypes ? <OrgUnitTypesPanel unitTypes={unitTypes} permissions={permissions} onChanged={() => void loadShared()} /> : <Loading />)}
        {section === 'access' && <OrgAccessPanel members={members} permissions={permissions} userNames={userNames} />}
      </div>
    </section>
  );
}

function Loading() {
  return <Text size="small" className="text-ui-fg-subtle" role="status">Loading…</Text>;
}
