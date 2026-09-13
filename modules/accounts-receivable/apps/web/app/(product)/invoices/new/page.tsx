import { InvoiceEditor } from '@/components/invoice-editor';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Create invoice' };

export default function NewInvoicePage() {
  return <InvoiceEditor />;
}
