import { InvoiceDetail } from '@/components/invoice-detail';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Invoice detail' };

export default async function InvoiceDetailPage({
  params,
}: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params;
  return <InvoiceDetail invoiceId={invoiceId} />;
}
