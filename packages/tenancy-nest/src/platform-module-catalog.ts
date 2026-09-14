export {
  assertEligibleModuleKeys,
  platformModuleCatalog,
  trialModuleKeys,
  type PlatformModuleDefinition,
  type PlatformModuleReadiness,
} from '@gigalibs/contracts';

export function configuredTenantBaseDomain(): string | null {
  const value = process.env.PLATFORM_TENANT_BASE_DOMAIN?.trim().toLowerCase();
  if (!value) return null;
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(value)) {
    throw new Error('PLATFORM_TENANT_BASE_DOMAIN must be a valid lowercase DNS name.');
  }
  return value;
}

export function tenantSubdomain(slug: string): string | null {
  const baseDomain = configuredTenantBaseDomain();
  return baseDomain ? `${slug}.${baseDomain}` : null;
}
