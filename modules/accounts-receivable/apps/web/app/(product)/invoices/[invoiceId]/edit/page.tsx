import { InvoiceEditor } from '@/components/invoice-editor';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Edit invoice' };

export default async function EditInvoicePage({
  params,
}: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params;
  return <InvoiceEditor invoiceId={invoiceId} />;
}
