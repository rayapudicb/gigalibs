import { Invoices } from '@/components/invoices';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Invoices' };

export default function InvoicesPage() {
  return <Invoices />;
}
