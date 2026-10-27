import { holdsPermission } from '../rbac/permission-match.js';

// WI-OI-120bc (Giga AI Companion): the screens the Companion may OPEN. When a goal is best served by the real app UI
// ("create a work order" → the work-order screen), the model returns a `navigate` decision naming a screen KEY from
// this catalogue, and the client does an in-app route change. The model can only pick a key here — it can never invent
// a path — and a screen is only offered when the caller holds its permission (least privilege, same as tools). Paths
// are the app's real routes.

export interface NavigableScreen {
  /** The key the model emits in a `navigate` decision. */
  readonly key: string;
  readonly label: string;
  /** The real in-app route the client navigates to. */
  readonly path: string;
  readonly description: string;
  /** The permission the caller must hold for the screen to be offered (the page enforces it too). */
  readonly requiresPermission: string;
}

export const NAVIGABLE_SCREENS: readonly NavigableScreen[] = [
  {
    key: 'cmms.work-orders',
    label: 'Work orders',
    path: '/cmms/work-orders',
    description: 'View and create maintenance work orders.',
    requiresPermission: 'cmms.work-orders.read',
  },
  {
    key: 'cmms.requests',
    label: 'Maintenance requests',
    path: '/cmms/requests',
    description: 'Raise and track maintenance requests.',
    requiresPermission: 'cmms.requests.read',
  },
  {
    key: 'cmms.meters',
    label: 'Meters',
    path: '/cmms/meters',
    description: 'Asset meters and their readings.',
    requiresPermission: 'cmms.meters.read',
  },
  {
    key: 'cmms.schedules',
    label: 'PM schedules',
    path: '/cmms/schedules',
    description: 'Preventive-maintenance schedules.',
    requiresPermission: 'cmms.schedules.read',
  },
  {
    key: 'inventory',
    label: 'Inventory',
    path: '/inventory',
    description: 'Stock, locations and balances.',
    requiresPermission: 'inventory:read',
  },
  {
    key: 'procurement',
    label: 'Procurement',
    path: '/procurement',
    description: 'Requisitions, purchase orders and bills.',
    requiresPermission: 'procurement:read',
  },
  {
    key: 'orders',
    label: 'Orders',
    path: '/orders',
    description: 'Sales quotes and orders.',
    requiresPermission: 'orders:read',
  },
  {
    key: 'parties',
    label: 'Parties',
    path: '/parties',
    description: 'Customers, vendors and other parties.',
    requiresPermission: 'parties:read',
  },
];

/** Find a screen by its key. */
export function findScreen(
  screens: readonly NavigableScreen[],
  key: string,
): NavigableScreen | undefined {
  return screens.find((screen) => screen.key === key);
}

/** The screens a caller may be offered — only those whose permission they hold (wildcards respected). */
export function screensForPermissions(
  screens: readonly NavigableScreen[],
  held: readonly string[] | null | undefined,
): readonly NavigableScreen[] {
  return screens.filter((screen) => holdsPermission(held, screen.requiresPermission));
}
