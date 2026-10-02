'use client';

import { workforceApi } from '@/lib/workforce-api';
import type { WfoIndustryPackManifestV1 } from '@gigalibs/contracts';
import {
  Alert,
  Badge,
  Button,
  Container,
  Heading,
  StatusBadge,
  Text,
} from '@medusajs/ui';
import { useCallback, useEffect, useState } from 'react';

export function WfoPackLibrary() {
  const [packs, setPacks] = useState<WfoIndustryPackManifestV1[]>([]);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState<string | null>(null);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadPacks = useCallback(async () => {
    try {
      setLoading(true);
      const data = await workforceApi.wfoListPacks();
      setPacks(data);
    } catch (err: any) {
      setAlert({ type: 'error', message: err.message || 'Failed to load industry packs' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPacks();
  }, [loadPacks]);

  const handleActivate = async (packId: string) => {
    try {
      setActivating(packId);
      setAlert(null);
      await workforceApi.wfoActivatePack(packId, 'US');
      setAlert({
        type: 'success',
        message: `Industry pack '${packId}' successfully activated for the current organization!`,
      });
      await loadPacks();
    } catch (err: any) {
      setAlert({ type: 'error', message: err.message || 'Failed to activate industry pack' });
    } finally {
      setActivating(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Heading level="h2">Universal Industry Pack Library</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Select and activate domain-tailored workforce operational templates with pre-configured terminology, compliance doc requirements, earning rates, and business rules.
          </Text>
        </div>
        <Button size="small" variant="secondary" onClick={loadPacks} disabled={loading}>
          Refresh Packs
        </Button>
      </div>

      {alert && (
        <Alert variant={alert.type}>
          {alert.message}
        </Alert>
      )}

      {loading ? (
        <Container className="p-8 text-center text-ui-fg-subtle">
          Loading industry packs...
        </Container>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {packs.map((pack) => {
            const terms = (pack.terminology || {}) as Record<string, string>;
            return (
              <Container
                key={pack.id}
                className={`p-6 flex flex-col justify-between border-2 rounded-xl transition-all ${
                  pack.isActive
                    ? 'border-ui-border-interactive bg-ui-bg-highlight'
                    : 'border-ui-border-base hover:border-ui-border-strong'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <Heading level="h3" className="text-base font-semibold">
                        {pack.name}
                      </Heading>
                      <Text size="xsmall" className="text-ui-fg-subtle">
                        v{pack.version} · {pack.currency} ({pack.countryCode})
                      </Text>
                    </div>
                    {pack.isActive ? (
                      <StatusBadge color="green">Active</StatusBadge>
                    ) : (
                      <StatusBadge color="grey">Available</StatusBadge>
                    )}
                  </div>

                  <Text size="small" className="text-ui-fg-subtle mb-4">
                    {pack.description}
                  </Text>

                  {/* Terminology Preview */}
                  <div className="bg-ui-bg-subtle p-3 rounded-md mb-4 space-y-1 text-xs">
                    <Text weight="plus" size="xsmall" className="text-ui-fg-muted uppercase tracking-wider">
                      Domain Terminology
                    </Text>
                    <div className="grid grid-cols-2 gap-1 text-ui-fg-subtle">
                      <div>Work Unit: <span className="font-medium text-ui-fg-base">{terms.workUnit || 'Unit'}</span></div>
                      <div>Worker: <span className="font-medium text-ui-fg-base">{terms.worker || 'Worker'}</span></div>
                      <div>Role: <span className="font-medium text-ui-fg-base">{terms.role || 'Role'}</span></div>
                      <div>Position: <span className="font-medium text-ui-fg-base">{terms.position || 'Slot'}</span></div>
                    </div>
                  </div>

                  {/* Governance Counts */}
                  <div className="flex flex-wrap gap-2 mb-6">
                    <Badge color="blue">{pack.complianceDocsCount || 0} Compliance Docs</Badge>
                    <Badge color="purple">{pack.earningTypesCount || 0} Earning Types</Badge>
                    <Badge color="orange">{pack.rulesCount || 0} Rules</Badge>
                  </div>
                </div>

                <div className="pt-4 border-t border-ui-border-base flex items-center justify-between">
                  {pack.isActive ? (
                    <Text size="small" className="text-ui-fg-interactive font-medium">
                      ✓ Active in Organization
                    </Text>
                  ) : (
                    <Button
                      size="small"
                      variant="primary"
                      className="w-full"
                      onClick={() => handleActivate(pack.slug)}
                      disabled={activating === pack.slug}
                    >
                      {activating === pack.slug ? 'Activating...' : 'Activate Pack'}
                    </Button>
                  )}
                </div>
              </Container>
            );
          })}
        </div>
      )}
    </div>
  );
}
