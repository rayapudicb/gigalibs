import type { VerifiedSession } from './verified-session';

/** WI-OI-121f: no customer-facing Assistant until the A1–A6 gates are accepted. */
export const ASSISTANT_MODULE_KEY = 'gigalibs-assistant';
export const ASSISTANT_PREVIEW_PERMISSION = 'assistant:preview';

type PreviewContext = Pick<VerifiedSession, 'tenant' | 'permissions'>;

export function canUseAssistantPreview(
  context: PreviewContext | null,
  environment = process.env.NODE_ENV,
  flag = process.env.GIGALIBS_ASSISTANT_DEV_PREVIEW_ENABLED,
): boolean {
  const tenant = context?.tenant;
  return (
    environment === 'development' &&
    flag === 'true' &&
    !!tenant &&
    (tenant.status === 'ACTIVE' || tenant.status === 'TRIAL') &&
    tenant.features.includes(ASSISTANT_MODULE_KEY) &&
    tenant.entitlements.some(
      (entitlement) => entitlement.moduleKey === ASSISTANT_MODULE_KEY && entitlement.status === 'ENABLED',
    ) &&
    // Deliberately exact: old wildcard and assistant:* grants cannot open this containment preview.
    context.permissions.includes(ASSISTANT_PREVIEW_PERMISSION)
  );
}
