import { SettingsScreen } from '@/components/settings/SettingsScreen';
import { redirect } from 'next/navigation';

// WI-OI-145: Settings screens are routes. A link from before (/settings?tab=…) lands on the same screen.
const FORMER_TABS: Readonly<Record<string, string>> = {
  people: '/settings/people',
  hierarchy: '/settings/organization',
  plan: '/settings/plan',
  general: '/settings/general',
  security: '/settings/security',
};

export default async function TenantSettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const { tab } = await searchParams;
  const target = typeof tab === 'string' ? FORMER_TABS[tab] : undefined;
  if (target) redirect(target);
  return <SettingsScreen section="team" />;
}
