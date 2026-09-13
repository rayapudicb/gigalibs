import { CustomerDetail } from '@/components/customers';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Customer' };

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  return <CustomerDetail customerId={customerId} />;
}
