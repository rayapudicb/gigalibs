import { SettingsScreen } from '@/components/settings/SettingsScreen';
import type { SettingsSection } from '@/components/settings/TenantSettingsView';
import { notFound } from 'next/navigation';

// WI-OI-145: the Settings screens after Team & access (which is /settings itself); /settings/profile is its own page.
const SECTIONS: readonly SettingsSection[] = ['people', 'organization', 'plan', 'general', 'security'];

export default async function SettingsSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!SECTIONS.includes(section as SettingsSection)) notFound();
  return <SettingsScreen section={section as SettingsSection} />;
}
