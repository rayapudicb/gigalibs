import { notFound } from 'next/navigation';
import { MasterDataScreen } from '@/components/master-data/MasterDataScreen';
import { isMasterDataGroup } from '@/lib/master-data';

// WI-OI-152: one group of the Master data area (the sidebar links each group here).
export default async function MasterDataGroupPage({ params }: { params: Promise<{ group: string }> }) {
  const { group } = await params;
  if (!isMasterDataGroup(group)) notFound();
  return <MasterDataScreen group={group} />;
}
