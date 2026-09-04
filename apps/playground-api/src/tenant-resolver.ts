import { prisma } from '@gigalibs/db';

export async function resolveTenantId(identifier?: string): Promise<string> {
  if (!identifier) {
    throw new Error('A validated tenant identifier is required.');
  }
  const tenant = await prisma.tenant.findFirst({
    where: { OR: [{ id: identifier }, { slug: identifier }] },
  });
  return tenant ? tenant.id : identifier;
}
