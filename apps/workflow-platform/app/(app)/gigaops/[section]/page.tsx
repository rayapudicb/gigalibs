import { GigaOpsWorkforceWorkbench } from '@/components/gigaops/GigaOpsWorkforceWorkbench';
import { isGigaOpsSection } from '@/components/gigaops/sections';
import { notFound } from 'next/navigation';

export default async function GigaOpsSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!isGigaOpsSection(section) || section === 'overview') notFound();
  return <GigaOpsWorkforceWorkbench section={section} />;
}
