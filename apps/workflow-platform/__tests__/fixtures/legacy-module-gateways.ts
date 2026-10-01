/**
 * Frozen copy of the hand-written gateway allow-lists as they were at commit 81005ab (lib/cmms-proxy.ts and
 * lib/workforce-proxy.ts), kept as the oracle for WI-OI-083a: the manifest-generated allow-lists must return the
 * same permission for every method and path. Do not edit; delete once the equivalence has been reviewed.
 */

const ID = '[0-9a-fA-F-]{36}';

export const LEGACY_CMMS_ROUTES: ReadonlyArray<
  readonly [method: string, pattern: RegExp, permission: string]
> = [
  ['POST', /^v1\/assets\/search$/, 'cmms.assets.read'],
  ['GET', new RegExp(`^v1/assets/${ID}$`), 'cmms.assets.read'],
  ['POST', /^v1\/assets$/, 'cmms.assets.write'],
  ['PATCH', new RegExp(`^v1/assets/${ID}$`), 'cmms.assets.write'],
  ['POST', new RegExp(`^v1/assets/${ID}/archive$`), 'cmms.assets.write'],
  ['POST', /^v1\/work-orders\/search$/, 'cmms.work-orders.read'],
  ['GET', new RegExp(`^v1/work-orders/${ID}(/history)?$`), 'cmms.work-orders.read'],
  ['POST', /^v1\/work-orders$/, 'cmms.work-orders.write'],
  ['PATCH', new RegExp(`^v1/work-orders/${ID}$`), 'cmms.work-orders.write'],
  [
    'POST',
    new RegExp(`^v1/work-orders/${ID}/(status|tasks|labour|parts|notes|staffing|staffing/cancel)$`),
    'cmms.work-orders.write',
  ],
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
export function legacyCmmsPermission(method: string, path: readonly string[]): string | null {
  const joined = path.join('/');
  return (
    LEGACY_CMMS_ROUTES.find(
      ([routeMethod, pattern]) => routeMethod === method && pattern.test(joined),
    )?.[2] ?? null
  );
}

const UUID_SEGMENT = '[0-9a-fA-F-]{36}';

const OWN_OR_READ_TIME = ['workforce.time.punch', 'workforce.time.read'] as const;

export function legacyWorkforcePermission(
  method: string,
  path: readonly string[],
): string | readonly string[] | null {
  const joined = path.join('/');
  if (joined === 'v1/runtime/tenant-scope' && method === 'GET') return 'workforce:read';
  // WI-OI-107: Workforce's section of the active packs, added after the gateways were generated.
  if (joined === 'v1/pack' && method === 'GET') return 'workforce:read';
  if (joined === 'v1/resources' && method === 'GET') return 'workforce.resources.read';
  if (joined === 'v1/resources' && method === 'POST') return 'workforce.resources.manage';
  if (new RegExp(`^v1/resources/${UUID_SEGMENT}$`).test(joined)) {
    return method === 'GET'
      ? 'workforce.resources.read'
      : method === 'PATCH'
        ? 'workforce.resources.manage'
        : null;
  }
  if (new RegExp(`^v1/resources/${UUID_SEGMENT}/capabilities$`).test(joined) && method === 'POST') {
    return 'workforce.capabilities.manage';
  }
  if (joined === 'v1/capabilities' && method === 'GET') return 'workforce.capabilities.read';
  if (joined === 'v1/capabilities' && method === 'POST') return 'workforce.capabilities.manage';
  // WI-OI-065: job profiles, positions and engagements.
  if (joined === 'v1/job-profiles')
    return method === 'GET'
      ? 'workforce.jobs.read'
      : method === 'POST'
        ? 'workforce.jobs.manage'
        : null;
  if (new RegExp(`^v1/job-profiles/${UUID_SEGMENT}$`).test(joined)) {
    return method === 'GET'
      ? 'workforce.jobs.read'
      : method === 'PATCH'
        ? 'workforce.jobs.manage'
        : null;
  }
  if (new RegExp(`^v1/job-profiles/${UUID_SEGMENT}/revisions$`).test(joined) && method === 'POST')
    return 'workforce.jobs.manage';
  if (joined === 'v1/positions')
    return method === 'GET'
      ? 'workforce.positions.read'
      : method === 'POST'
        ? 'workforce.positions.manage'
        : null;
  if (new RegExp(`^v1/positions/${UUID_SEGMENT}$`).test(joined)) {
    return method === 'GET'
      ? 'workforce.positions.read'
      : method === 'PATCH'
        ? 'workforce.positions.manage'
        : null;
  }
  if (joined === 'v1/engagements') {
    return method === 'GET'
      ? 'workforce.engagements.read'
      : method === 'POST'
        ? 'workforce.engagements.manage'
        : null;
  }
  if (new RegExp(`^v1/engagements/${UUID_SEGMENT}/(end|cancel)$`).test(joined) && method === 'POST')
    return 'workforce.engagements.manage';
  // WI-OI-066: availability patterns, absences and working calendars.
  if (joined === 'v1/availability' && method === 'GET') return 'workforce.availability.read';
  if (joined === 'v1/availability-patterns') {
    return method === 'GET'
      ? 'workforce.availability.read'
      : method === 'POST'
        ? 'workforce.availability.manage'
        : null;
  }
  if (
    new RegExp(`^v1/availability-patterns/${UUID_SEGMENT}/end$`).test(joined) &&
    method === 'POST'
  )
    return 'workforce.availability.manage';
  if (joined === 'v1/absence-types')
    return method === 'GET'
      ? 'workforce.absences.read'
      : method === 'POST'
        ? 'workforce.calendars.manage'
        : null;
  if (new RegExp(`^v1/absence-types/${UUID_SEGMENT}$`).test(joined) && method === 'PATCH')
    return 'workforce.calendars.manage';
  if (joined === 'v1/absences')
    return method === 'GET'
      ? 'workforce.absences.read'
      : method === 'POST'
        ? 'workforce.absences.request'
        : null;
  if (
    new RegExp(`^v1/absences/${UUID_SEGMENT}/(approve|reject)$`).test(joined) &&
    method === 'POST'
  )
    return 'workforce.absences.approve';
  if (new RegExp(`^v1/absences/${UUID_SEGMENT}/cancel$`).test(joined) && method === 'POST')
    return 'workforce.absences.request';
  if (joined === 'v1/working-calendars')
    return method === 'GET'
      ? 'workforce.calendars.read'
      : method === 'POST'
        ? 'workforce.calendars.manage'
        : null;
  if (
    new RegExp(`^v1/working-calendars/${UUID_SEGMENT}/closures$`).test(joined) &&
    method === 'POST'
  )
    return 'workforce.calendars.manage';
  if (
    new RegExp(`^v1/working-calendars/${UUID_SEGMENT}/closures/${UUID_SEGMENT}/withdraw$`).test(
      joined,
    ) &&
    method === 'POST'
  ) {
    return 'workforce.calendars.manage';
  }
  // WI-OI-067: demand requirements and bookings.
  if (joined === 'v1/work-requirements')
    return method === 'GET'
      ? 'workforce.demand.read'
      : method === 'POST'
        ? 'workforce.demand.manage'
        : null;
  if (new RegExp(`^v1/work-requirements/${UUID_SEGMENT}$`).test(joined) && method === 'GET')
    return 'workforce.demand.read';
  if (
    new RegExp(`^v1/work-requirements/${UUID_SEGMENT}/candidates$`).test(joined) &&
    method === 'GET'
  )
    return 'workforce.bookings.read';
  if (new RegExp(`^v1/work-requirements/${UUID_SEGMENT}/cancel$`).test(joined) && method === 'POST')
    return 'workforce.demand.manage';
  if (joined === 'v1/bookings')
    return method === 'GET'
      ? 'workforce.bookings.read'
      : method === 'POST'
        ? 'workforce.bookings.manage'
        : null;
  if (new RegExp(`^v1/bookings/${UUID_SEGMENT}/status$`).test(joined) && method === 'POST')
    return 'workforce.bookings.manage';
  // WI-OI-069: time and attendance. Workers reach their own time; managers read, correct and approve others'.
  if (joined === 'v1/punches')
    return method === 'POST' ? 'workforce.time.punch' : method === 'GET' ? OWN_OR_READ_TIME : null;
  if (joined === 'v1/timesheets/preview' && method === 'GET') return OWN_OR_READ_TIME;
  if (joined === 'v1/timesheets')
    return method === 'GET'
      ? OWN_OR_READ_TIME
      : method === 'POST'
        ? ['workforce.time.punch', 'workforce.time.manage']
        : null;
  if (new RegExp(`^v1/timesheets/${UUID_SEGMENT}$`).test(joined) && method === 'GET')
    return OWN_OR_READ_TIME;
  if (
    new RegExp(`^v1/timesheets/${UUID_SEGMENT}/(approve|reject)$`).test(joined) &&
    method === 'POST'
  )
    return 'workforce.timesheets.approve';
  if (joined === 'v1/time-corrections' && method === 'POST') return 'workforce.time.manage';
  if (joined === 'v1/time-exceptions' && method === 'GET') return OWN_OR_READ_TIME;
  if (new RegExp(`^v1/time-exceptions/${UUID_SEGMENT}/resolve$`).test(joined) && method === 'POST')
    return 'workforce.time.manage';
  // WI-OI-070: pay policy packs, rates and calculation runs.
  if (joined === 'v1/pay-packs' && method === 'GET') return 'workforce.pay.read';
  if (joined === 'v1/pay-rates')
    return method === 'GET'
      ? 'workforce.pay.read'
      : method === 'POST'
        ? 'workforce.pay.manage'
        : null;
  if (joined === 'v1/pay-runs')
    return method === 'GET'
      ? 'workforce.pay.read'
      : method === 'POST'
        ? 'workforce.pay.manage'
        : null;
  if (new RegExp(`^v1/pay-runs/${UUID_SEGMENT}(/verification)?$`).test(joined) && method === 'GET')
    return 'workforce.pay.read';
  if (new RegExp(`^v1/pay-runs/${UUID_SEGMENT}/approve$`).test(joined) && method === 'POST')
    return 'workforce.pay.approve';
  if (new RegExp(`^v1/pay-runs/${UUID_SEGMENT}/void$`).test(joined) && method === 'POST')
    return 'workforce.pay.manage';
  // WI-OI-071: payroll exports and reconciliation.
  if (new RegExp(`^v1/pay-runs/${UUID_SEGMENT}/exports$`).test(joined) && method === 'POST')
    return 'workforce.pay.manage';
  if (joined === 'v1/pay-exports' && method === 'GET') return 'workforce.pay.read';
  if (
    new RegExp(`^v1/pay-exports/${UUID_SEGMENT}(/file|/reconciliation)?$`).test(joined) &&
    method === 'GET'
  )
    return 'workforce.pay.read';
  if (new RegExp(`^v1/pay-exports/${UUID_SEGMENT}/acknowledge$`).test(joined) && method === 'POST')
    return 'workforce.pay.manage';
  return null;
}
