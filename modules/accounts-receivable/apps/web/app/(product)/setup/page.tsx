import { SetupForm } from '@/components/setup-form';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Module setup' };

export default function SetupPage() {
  return <SetupForm />;
}
