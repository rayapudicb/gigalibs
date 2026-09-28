import {
  createSignedModuleProxy,
  type SignedModuleProxyConfig,
  type SignedModuleRouteContext,
} from '@/lib/signed-module-proxy';

export type CmmsRouteContext = SignedModuleRouteContext;

const ID = '[0-9a-fA-F-]{36}';

// WI-OI-038: CMMS verifies this BFF-signed PlatformContextV1 (its own key and audience) and receives the user's
// verified scopes. Only the core routes below reach the module; everything else is refused here.
export const cmmsModule: SignedModuleProxyConfig = {
  moduleKey: 'asset-maintenance',
  audience: 'gigalibs-cmms-api',
  upstream: 'cmms',
  privateKeyEnvironmentKey: 'CMMS_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64',
  codePrefix: 'CMMS',
  routeNoun: 'CMMS',
  serviceName: 'Asset & Maintenance',
  entitlementName: 'Asset & Maintenance',
  requiredPermission: requiredCmmsPermission,
};

export const proxyCmms = createSignedModuleProxy(cmmsModule);

const ROUTES: ReadonlyArray<readonly [method: string, pattern: RegExp, permission: string]> = [
  ['POST', /^v1\/assets\/search$/, 'cmms.assets.read'],
  ['GET', new RegExp(`^v1/assets/${ID}$`), 'cmms.assets.read'],
  ['POST', /^v1\/assets$/, 'cmms.assets.write'],
  ['PATCH', new RegExp(`^v1/assets/${ID}$`), 'cmms.assets.write'],
  ['POST', new RegExp(`^v1/assets/${ID}/archive$`), 'cmms.assets.write'],
  ['POST', /^v1\/work-orders\/search$/, 'cmms.work-orders.read'],
  ['GET', new RegExp(`^v1/work-orders/${ID}(/history)?$`), 'cmms.work-orders.read'],
  ['POST', /^v1\/work-orders$/, 'cmms.work-orders.write'],
  ['PATCH', new RegExp(`^v1/work-orders/${ID}$`), 'cmms.work-orders.write'],
  ['POST', new RegExp(`^v1/work-orders/${ID}/(status|tasks|labour|parts|notes|staffing|staffing/cancel)$`), 'cmms.work-orders.write'],
  ['PATCH', new RegExp(`^v1/work-orders/${ID}/tasks/${ID}$`), 'cmms.work-orders.write'],
  ['GET', /^v1\/pm-schedules$/, 'cmms.pm.read'],
  ['GET', new RegExp(`^v1/pm-schedules/${ID}$`), 'cmms.pm.read'],
  ['POST', /^v1\/pm-schedules$/, 'cmms.pm.write'],
  ['PATCH', new RegExp(`^v1/pm-schedules/${ID}$`), 'cmms.pm.write'],
  ['POST', new RegExp(`^v1/pm-schedules/${ID}/generate$`), 'cmms.pm.write'],
  ['GET', /^v1\/meters$/, 'cmms.meters.read'],
  ['POST', /^v1\/meters$/, 'cmms.meters.write'],
  ['GET', new RegExp(`^v1/meters/${ID}/readings$`), 'cmms.meters.read'],
  ['POST', new RegExp(`^v1/meters/${ID}/readings$`), 'cmms.meters.write'],
  ['POST', /^v1\/parts\/search$/, 'cmms.parts.read'],
  ['GET', new RegExp(`^v1/parts/${ID}(/movements)?$`), 'cmms.parts.read'],
  ['POST', /^v1\/parts$/, 'cmms.parts.write'],
  ['PATCH', new RegExp(`^v1/parts/${ID}$`), 'cmms.parts.write'],
  ['POST', new RegExp(`^v1/parts/${ID}/movements$`), 'cmms.parts.write'],
  ['GET', /^v1\/analytics\/(work-orders\/overview|inventory\/summary)$/, 'cmms.analytics.read'],
];

/** Allow-list: the permission a method and path require, or null when the route is not exposed. */
export function requiredCmmsPermission(method: string, path: readonly string[]): string | null {
  const joined = path.join('/');
  return ROUTES.find(([routeMethod, pattern]) => routeMethod === method && pattern.test(joined))?.[2] ?? null;
}
