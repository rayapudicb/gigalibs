import { Customers } from '@/components/customers';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Customers' };

export default function CustomersPage() {
  return <Customers />;
}
