import AccountForm from '@/components/auth/AccountForm';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ ssoError?: string }>;
}) {
  const { ssoError } = await searchParams;
  return <AccountForm {...(ssoError ? { ssoError } : {})} />;
}
