// WI-OI-152 (ADR-0037 §3): the master data registry. Each module declares its masters in `spec.masters` of its
// manifest; `pnpm modules:catalog` validates them against the module's windows, menus and permissions and generates
// `registry.generated.ts`. The web shell's Master data area lists the masters a person may read, with live counts.

/** The Master data area's sections, in display order. */
export const MASTER_DATA_GROUPS = [
  'organization-and-people',
  'products-and-stock',
  'partners',
  'finance',
  'assets-and-places',
  'reference-data',
] as const;
export type MasterDataGroup = (typeof MASTER_DATA_GROUPS)[number];

export const MASTER_DATA_GROUP_LABELS: Readonly<Record<MasterDataGroup, string>> = {
  'organization-and-people': 'Organization and people',
  'products-and-stock': 'Products and stock',
  partners: 'Customers and vendors',
  finance: 'Finance',
  'assets-and-places': 'Assets and places',
  'reference-data': 'Reference data',
};

/** ADR-0038: platform reference data (read-only), pack-provided data, or the workspace's own module records. */
export type MasterDataLevel = 'PLATFORM_REFERENCE' | 'PACK' | 'MODULE';

/** How the hub counts a master: a one-row page of the module's record list, or a platform lookup (50 at most). */
export type MasterDataCountSource =
  | { readonly kind: 'records'; readonly basePath: string; readonly entity: string }
  | { readonly kind: 'lookup'; readonly basePath: string; readonly resolver: string };

export interface MasterDataEntryV1 {
  /** Unique across the platform: the window entity key, or the lookup key for control-plane masters. */
  readonly key: string;
  readonly label: string;
  readonly group: MasterDataGroup;
  readonly level: MasterDataLevel;
  /** The owning module's folder name (or `core`) and its catalogue entry, whose entitlement the master follows. */
  readonly moduleKey: string;
  readonly catalogKey: string;
  readonly moduleLabel: string;
  /** The screen where the master is kept; it stays reachable from its module too. */
  readonly route: string;
  readonly readPermission: string;
  readonly count: MasterDataCountSource;
  /** Filled by WI-OI-155 (import kit) and WI-OI-154 (packs). */
  readonly importable: boolean;
  readonly packSection: string | null;
}

/** Platform lookups answer at most this many options, so a count at the cap is shown as "50+". */
export const MASTER_DATA_LOOKUP_CAP = 50;

export { MASTER_DATA_REGISTRY } from './registry.generated.js';
