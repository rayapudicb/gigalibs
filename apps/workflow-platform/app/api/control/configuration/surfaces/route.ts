import { NextResponse } from 'next/server';

/**
 * Surface registry — lists all schema-driven surfaces available in the platform.
 * Each surface is a (moduleKey, entityKey, surfaceKey) triple that the
 * ConfigurationStudioWorkbench uses to drive the surface picker.
 *
 * Extend this list when a new module registers a configurable surface.
 */
const SURFACE_REGISTRY = [
  {
    moduleKey: 'tenant-settings',
    entityKey: 'tenant-profile',
    surfaceKey: 'profile-extension',
    registrationKey: 'tenant-settings:tenant-profile:profile-extension',
    label: 'Tenant profile extension',
    description: 'Add schema-defined fields to the tenant profile form.',
  },
  {
    moduleKey: 'tenant-apps',
    entityKey: 'custom-record',
    surfaceKey: 'custom-form',
    registrationKey: 'tenant-apps:custom-record:custom-form',
    label: 'Tenant application',
    description: 'Schema-driven form for a tenant-scoped custom application.',
  },
  {
    moduleKey: 'accounts-receivable',
    entityKey: 'customer',
    surfaceKey: 'customer-extension',
    registrationKey: 'accounts-receivable:customer:customer-extension',
    label: 'AR — Customer extension',
    description: 'Add configurable fields to the AR customer record.',
  },
  {
    moduleKey: 'accounts-receivable',
    entityKey: 'invoice',
    surfaceKey: 'invoice-extension',
    registrationKey: 'accounts-receivable:invoice:invoice-extension',
    label: 'AR — Invoice extension',
    description: 'Add configurable fields to the AR invoice form.',
  },
] as const;

export async function GET() {
  return NextResponse.json({ items: SURFACE_REGISTRY });
}
