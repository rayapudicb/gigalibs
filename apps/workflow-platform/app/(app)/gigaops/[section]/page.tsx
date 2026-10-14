import { GigaOpsWorkforceWorkbench } from '@/components/gigaops/GigaOpsWorkforceWorkbench';
import { isGigaOpsSection } from '@/components/gigaops/sections';
import { notFound, redirect } from 'next/navigation';

export default async function GigaOpsSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  // WI-OI-120ah: the old Clock & timesheets address now opens the one Time & Attendance screen.
  if (section === 'attendance') redirect('/gigaops/time');
  if (!isGigaOpsSection(section) || section === 'overview') notFound();
  return <GigaOpsWorkforceWorkbench section={section} />;
}
