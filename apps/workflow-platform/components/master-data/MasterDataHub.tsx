'use client';

import { MASTER_DATA_GROUP_LABELS, type MasterDataEntryV1, type MasterDataGroup } from '@gigalibs/contracts';
import { EmptyState, ModulePage, PageTabs } from '@gigalibs/web-sdk';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  countMaster,
  type MasterCount,
  masterGroups,
  masterUnavailableReason,
  type ModuleAccessContext,
} from '@/lib/master-data';

// WI-OI-152 (ADR-0037 §3): every master the person may read, by group, with how many records it holds. Each master
// opens on its own module's screen; nothing is edited here.

type GroupTab = MasterDataGroup | 'all';

const STATE_STYLE = {
  counting: 'bg-ui-bg-subtle text-ui-fg-muted',
  empty: 'bg-ui-tag-orange-bg text-ui-tag-orange-text',
  inUse: 'bg-ui-tag-green-bg text-ui-tag-green-text',
  unavailable: 'bg-ui-bg-subtle text-ui-fg-subtle',
} as const;

function stateOf(
  entry: MasterDataEntryV1,
  count: MasterCount | undefined,
): { label: string; style: string; records: string } {
  if (!count) return { label: 'Counting…', style: STATE_STYLE.counting, records: '…' };
  if (count.state === 'unavailable')
    return {
      label: masterUnavailableReason(entry, count),
      style: STATE_STYLE.unavailable,
      records: '—',
    };
  const records = count.capped ? `${count.count}+` : count.count.toLocaleString();
  return count.count === 0
    ? { label: 'Empty', style: STATE_STYLE.empty, records }
    : { label: 'In use', style: STATE_STYLE.inUse, records };
}

export function MasterDataHub({
  masters,
  group,
  accessContext,
}: {
  masters: readonly MasterDataEntryV1[];
  group: GroupTab;
  accessContext: ModuleAccessContext;
}) {
  const router = useRouter();
  const [counts, setCounts] = useState<Readonly<Record<string, MasterCount>>>({});
  const groups = masterGroups(masters);
  const shown = group === 'all' ? masters : masters.filter((entry) => entry.group === group);

  useEffect(() => {
    let cancelled = false;
    for (const entry of shown) {
      void countMaster(entry, fetch, 2_000, accessContext).then((count) => {
        if (!cancelled) setCounts((current) => ({ ...current, [entry.key]: count }));
      });
    }
    return () => {
      cancelled = true;
    };
    // Counted once per group shown; the list itself comes from the server.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group, masters]);

  const tabs = [
    { key: 'all' as GroupTab, label: 'All', count: masters.length },
    ...groups.map((key) => ({
      key: key as GroupTab,
      label: MASTER_DATA_GROUP_LABELS[key],
      count: masters.filter((entry) => entry.group === key).length,
    })),
  ];

  return (
    <ModulePage title="Master data">
      {masters.length === 0 ? (
        <EmptyState
          title="No master data to show"
          description="Masters appear here when your roles let you read them. Each one is also in its own module."
        />
      ) : (
        <div className="space-y-4">
          <PageTabs
            label="Master data groups"
            idPrefix="master-data"
            tabs={tabs}
            value={group}
            onChange={(key) => router.push(key === 'all' ? '/master-data' : `/master-data/${key}`)}
          />
          <div className="overflow-x-auto rounded-lg border border-ui-border-base bg-ui-bg-base">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-ui-border-base bg-ui-bg-subtle text-ui-fg-subtle">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Master</th>
                  {group === 'all' ? (
                    <th scope="col" className="px-3 py-2 font-medium">Group</th>
                  ) : null}
                  <th scope="col" className="px-3 py-2 font-medium">Kept in</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Records</th>
                  <th scope="col" className="px-3 py-2 font-medium">State</th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((entry) => {
                  const state = stateOf(entry, counts[entry.key]);
                  return (
                    <tr key={entry.key} className="border-b border-ui-border-base last:border-0">
                      <td className="px-3 py-2 font-medium text-ui-fg-base">{entry.label}</td>
                      {group === 'all' ? (
                        <td className="px-3 py-2 text-ui-fg-subtle">{MASTER_DATA_GROUP_LABELS[entry.group]}</td>
                      ) : null}
                      <td className="px-3 py-2 text-ui-fg-subtle">{entry.moduleLabel}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-ui-fg-base">{state.records}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${state.style}`}>
                          {state.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Link
                          href={entry.route}
                          className="text-xs font-semibold text-ui-fg-interactive hover:text-ui-fg-interactive-hover"
                          aria-label={`Open ${entry.label}`}
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </ModulePage>
  );
}
