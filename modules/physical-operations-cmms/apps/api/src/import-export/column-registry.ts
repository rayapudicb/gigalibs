// WI-OI-043 — Column registry: source of truth for every importable CMMS entity.
import type { EntityColumnDef, ImportableEntityType } from './types.js';

const ASSET_COLUMNS: EntityColumnDef[] = [
  { key: 'name', dbColumn: 'name', kind: 'db-direct', required: true, description: 'Asset display name', templateWidth: 30, detectFormulas: true },
  { key: 'asset_tag', dbColumn: 'asset_tag', kind: 'db-direct', required: false, description: 'Barcode / QR / NFC tag', templateWidth: 16 },
  { key: 'serial_number', dbColumn: 'serial_number', kind: 'db-direct', required: false, description: 'Manufacturer serial number', templateWidth: 20 },
  { key: 'model', dbColumn: 'model', kind: 'db-direct', required: false, description: 'Model name / number', templateWidth: 20 },
  { key: 'manufacturer', dbColumn: 'manufacturer', kind: 'db-direct', required: false, description: 'Manufacturer name', templateWidth: 20 },
  { key: 'description', dbColumn: 'description', kind: 'db-direct', required: false, description: 'Free-text description', templateWidth: 40 },
  { key: 'status', dbColumn: 'status', kind: 'db-direct', required: false, description: 'Asset status', enumValues: ['OPERATIONAL','UNDER_MAINTENANCE','OFFLINE','DECOMMISSIONED'], templateWidth: 18 },
  { key: 'criticality', dbColumn: 'criticality', kind: 'db-direct', required: false, description: 'Business criticality', enumValues: ['LOW','MEDIUM','HIGH','CRITICAL'], templateWidth: 10 },
  { key: 'area', dbColumn: 'area', kind: 'db-direct', required: false, description: 'Physical area within location', templateWidth: 16 },
  { key: 'power', dbColumn: 'power', kind: 'db-direct', required: false, description: 'Power spec e.g. "220V 15A"', templateWidth: 12 },
  { key: 'acquisition_cost', dbColumn: 'acquisition_cost', kind: 'db-direct', required: false, description: 'Purchase cost', templateWidth: 14, exportRoles: ['TENANT_ADMIN','OPERATIONS_SUPERVISOR'] },
  { key: 'currency_code', dbColumn: 'currency_code', kind: 'db-direct', required: false, description: 'ISO 4217 e.g. USD', templateWidth: 6, exportRoles: ['TENANT_ADMIN','OPERATIONS_SUPERVISOR'] },
  { key: 'purchase_date', dbColumn: 'purchase_date', kind: 'db-direct', required: false, description: 'Date of purchase (YYYY-MM-DD)', templateWidth: 14 },
  { key: 'warranty_expiry', dbColumn: 'warranty_expiry', kind: 'db-direct', required: false, description: 'Warranty expiry (YYYY-MM-DD)', templateWidth: 16 },
  { key: 'location_name', dbColumn: 'location_id', kind: 'fk-resolve', required: false, description: 'Location name', fkResolution: { table: 'locations', matchColumn: 'name', resolvedDbColumn: 'location_id', nullable: true }, templateWidth: 24 },
  { key: 'category_name', dbColumn: 'category_id', kind: 'fk-resolve', required: false, description: 'Asset category name', fkResolution: { table: 'asset_categories', matchColumn: 'name', resolvedDbColumn: 'category_id', nullable: true }, templateWidth: 20 },
  { key: 'parent_asset_tag', dbColumn: 'parent_asset_id', kind: 'hierarchy', required: false, description: 'Parent asset tag', fkResolution: { table: 'assets', matchColumn: 'asset_tag', resolvedDbColumn: 'parent_asset_id', nullable: true }, hierarchyParentMatchColumn: 'asset_tag', templateWidth: 16 },
  { key: 'id', dbColumn: 'id', kind: 'computed', required: false, description: 'System UUID', exportOnly: true, templateWidth: 36 },
  { key: 'created_at', dbColumn: 'created_at', kind: 'computed', required: false, description: 'Created timestamp', exportOnly: true, templateWidth: 22 },
  { key: 'updated_at', dbColumn: 'updated_at', kind: 'computed', required: false, description: 'Last updated timestamp', exportOnly: true, templateWidth: 22 },
];

const LOCATION_COLUMNS: EntityColumnDef[] = [
  { key: 'name', dbColumn: 'name', kind: 'db-direct', required: true, description: 'Location display name', templateWidth: 30, detectFormulas: true },
  { key: 'code', dbColumn: 'code', kind: 'db-direct', required: false, description: 'Short location code', templateWidth: 12 },
  { key: 'description', dbColumn: 'description', kind: 'db-direct', required: false, description: 'Description', templateWidth: 40 },
  { key: 'address', dbColumn: 'address', kind: 'db-direct', required: false, description: 'Street address', templateWidth: 30 },
  { key: 'city', dbColumn: 'city', kind: 'db-direct', required: false, description: 'City', templateWidth: 16 },
  { key: 'country_code', dbColumn: 'country_code', kind: 'db-direct', required: false, description: 'ISO 3166-1 alpha-2 code', templateWidth: 6 },
  { key: 'timezone', dbColumn: 'timezone', kind: 'db-direct', required: false, description: 'IANA timezone', templateWidth: 24 },
  { key: 'parent_location_name', dbColumn: 'parent_id', kind: 'hierarchy', required: false, description: 'Parent location name', fkResolution: { table: 'locations', matchColumn: 'name', resolvedDbColumn: 'parent_id', nullable: true }, hierarchyParentMatchColumn: 'name', templateWidth: 30 },
  { key: 'id', dbColumn: 'id', kind: 'computed', required: false, description: 'System UUID', exportOnly: true, templateWidth: 36 },
  { key: 'created_at', dbColumn: 'created_at', kind: 'computed', required: false, description: 'Created timestamp', exportOnly: true, templateWidth: 22 },
];

const PART_COLUMNS: EntityColumnDef[] = [
  { key: 'name', dbColumn: 'name', kind: 'db-direct', required: true, description: 'Part name', templateWidth: 30, detectFormulas: true },
  { key: 'part_number', dbColumn: 'part_number', kind: 'db-direct', required: false, description: 'Manufacturer part number', templateWidth: 20 },
  { key: 'description', dbColumn: 'description', kind: 'db-direct', required: false, description: 'Description', templateWidth: 40 },
  { key: 'unit_of_measure', dbColumn: 'unit_of_measure', kind: 'db-direct', required: false, description: 'e.g. EA, KG, L', templateWidth: 8 },
  { key: 'quantity_on_hand', dbColumn: 'quantity_on_hand', kind: 'db-direct', required: false, description: 'Current stock quantity', templateWidth: 14 },
  { key: 'reorder_point', dbColumn: 'reorder_point', kind: 'db-direct', required: false, description: 'Reorder trigger level', templateWidth: 12 },
  { key: 'unit_cost', dbColumn: 'unit_cost', kind: 'db-direct', required: false, description: 'Cost per unit', templateWidth: 12, exportRoles: ['TENANT_ADMIN','OPERATIONS_SUPERVISOR'] },
  { key: 'storage_location', dbColumn: 'storage_location', kind: 'db-direct', required: false, description: 'Bin / shelf reference', templateWidth: 20 },
  { key: 'category_name', dbColumn: 'category_id', kind: 'fk-resolve', required: false, description: 'Part category name', fkResolution: { table: 'part_categories', matchColumn: 'name', resolvedDbColumn: 'category_id', nullable: true }, templateWidth: 20 },
  { key: 'vendor_name', dbColumn: 'preferred_vendor_id', kind: 'fk-resolve', required: false, description: 'Preferred vendor name', fkResolution: { table: 'vendors', matchColumn: 'name', resolvedDbColumn: 'preferred_vendor_id', nullable: true }, templateWidth: 24 },
  { key: 'id', dbColumn: 'id', kind: 'computed', required: false, description: 'System UUID', exportOnly: true, templateWidth: 36 },
];

const VENDOR_COLUMNS: EntityColumnDef[] = [
  { key: 'name', dbColumn: 'name', kind: 'db-direct', required: true, description: 'Vendor name', templateWidth: 30, detectFormulas: true },
  { key: 'code', dbColumn: 'code', kind: 'db-direct', required: false, description: 'Short vendor code', templateWidth: 12 },
  { key: 'contact_name', dbColumn: 'contact_name', kind: 'db-direct', required: false, description: 'Primary contact name', templateWidth: 24 },
  { key: 'contact_email', dbColumn: 'contact_email', kind: 'db-direct', required: false, description: 'Contact email', templateWidth: 30 },
  { key: 'contact_phone', dbColumn: 'contact_phone', kind: 'db-direct', required: false, description: 'Contact phone', templateWidth: 16 },
  { key: 'address', dbColumn: 'address', kind: 'db-direct', required: false, description: 'Street address', templateWidth: 30 },
  { key: 'website', dbColumn: 'website', kind: 'db-direct', required: false, description: 'Website URL', templateWidth: 30 },
  { key: 'tax_id', dbColumn: 'tax_id', kind: 'db-direct', required: false, description: 'Tax / VAT number', templateWidth: 20 },
  { key: 'status', dbColumn: 'status', kind: 'db-direct', required: false, description: 'Vendor status', enumValues: ['ACTIVE','INACTIVE','BLACKLISTED'], templateWidth: 12 },
  { key: 'id', dbColumn: 'id', kind: 'computed', required: false, description: 'System UUID', exportOnly: true, templateWidth: 36 },
];

const CUSTOMER_COLUMNS: EntityColumnDef[] = [
  { key: 'name', dbColumn: 'name', kind: 'db-direct', required: true, description: 'Customer name', templateWidth: 30, detectFormulas: true },
  { key: 'code', dbColumn: 'code', kind: 'db-direct', required: false, description: 'Customer code', templateWidth: 12 },
  { key: 'contact_name', dbColumn: 'contact_name', kind: 'db-direct', required: false, description: 'Contact name', templateWidth: 24 },
  { key: 'contact_email', dbColumn: 'contact_email', kind: 'db-direct', required: false, description: 'Contact email', templateWidth: 30 },
  { key: 'contact_phone', dbColumn: 'contact_phone', kind: 'db-direct', required: false, description: 'Contact phone', templateWidth: 16 },
  { key: 'address', dbColumn: 'address', kind: 'db-direct', required: false, description: 'Street address', templateWidth: 30 },
  { key: 'status', dbColumn: 'status', kind: 'db-direct', required: false, description: 'Status', enumValues: ['ACTIVE','INACTIVE'], templateWidth: 10 },
  { key: 'id', dbColumn: 'id', kind: 'computed', required: false, description: 'System UUID', exportOnly: true, templateWidth: 36 },
];

const WORKFORCE_COLUMNS: EntityColumnDef[] = [
  { key: 'first_name', dbColumn: 'first_name', kind: 'db-direct', required: true, description: 'First name', templateWidth: 20, detectFormulas: true },
  { key: 'last_name', dbColumn: 'last_name', kind: 'db-direct', required: true, description: 'Last name', templateWidth: 20, detectFormulas: true },
  { key: 'employee_id', dbColumn: 'employee_id', kind: 'db-direct', required: false, description: 'HR employee identifier', templateWidth: 16 },
  { key: 'email', dbColumn: 'email', kind: 'db-direct', required: false, description: 'Work email', templateWidth: 30 },
  { key: 'phone', dbColumn: 'phone', kind: 'db-direct', required: false, description: 'Contact phone', templateWidth: 16 },
  { key: 'role', dbColumn: 'role', kind: 'db-direct', required: false, description: 'Job role / title', templateWidth: 24 },
  { key: 'status', dbColumn: 'status', kind: 'db-direct', required: false, description: 'Employment status', enumValues: ['ACTIVE','INACTIVE','ON_LEAVE'], templateWidth: 12 },
  { key: 'hourly_rate', dbColumn: 'hourly_rate', kind: 'db-direct', required: false, description: 'Hourly rate', exportRoles: ['TENANT_ADMIN','OPERATIONS_SUPERVISOR'], templateWidth: 12 },
  { key: 'department_name', dbColumn: 'department_id', kind: 'fk-resolve', required: false, description: 'Department name', fkResolution: { table: 'departments', matchColumn: 'name', resolvedDbColumn: 'department_id', nullable: true }, templateWidth: 24 },
  { key: 'id', dbColumn: 'id', kind: 'computed', required: false, description: 'System UUID', exportOnly: true, templateWidth: 36 },
];

const DEPARTMENT_COLUMNS: EntityColumnDef[] = [
  { key: 'name', dbColumn: 'name', kind: 'db-direct', required: true, description: 'Department name', templateWidth: 30, detectFormulas: true },
  { key: 'code', dbColumn: 'code', kind: 'db-direct', required: false, description: 'Short code (unique)', templateWidth: 12 },
  { key: 'description', dbColumn: 'description', kind: 'db-direct', required: false, description: 'Description', templateWidth: 40 },
  { key: 'cost_center_code', dbColumn: 'cost_center_code', kind: 'db-direct', required: false, description: 'Finance cost center code', templateWidth: 16, exportRoles: ['TENANT_ADMIN'] },
  { key: 'parent_dept_name', dbColumn: 'parent_id', kind: 'hierarchy', required: false, description: 'Parent department name', fkResolution: { table: 'departments', matchColumn: 'name', resolvedDbColumn: 'parent_id', nullable: true }, hierarchyParentMatchColumn: 'name', templateWidth: 30 },
  { key: 'id', dbColumn: 'id', kind: 'computed', required: false, description: 'System UUID', exportOnly: true, templateWidth: 36 },
];

const USER_COLUMNS: EntityColumnDef[] = [
  { key: 'email', dbColumn: 'email', kind: 'db-direct', required: true, description: 'User email address (must be unique across the tenant)', templateWidth: 36 },
  { key: 'name', dbColumn: 'name', kind: 'db-direct', required: true, description: 'Full display name', templateWidth: 28, detectFormulas: true },
  { key: 'role', dbColumn: 'role', kind: 'db-direct', required: false, description: 'Tenant membership role', enumValues: ['TENANT_ADMIN','MANAGER','MEMBER','VIEWER','GUEST'], templateWidth: 14 },
  { key: 'expires_in_hours', dbColumn: 'expires_in_hours', kind: 'db-direct', required: false, description: 'Invite link validity in hours (default 72, max 168)', templateWidth: 16 },
];


const REGISTRY = new Map<ImportableEntityType, EntityColumnDef[]>([
  ['assets', ASSET_COLUMNS],
  ['locations', LOCATION_COLUMNS],
  ['parts', PART_COLUMNS],
  ['vendors', VENDOR_COLUMNS],
  ['customers', CUSTOMER_COLUMNS],
  ['workforce_resources', WORKFORCE_COLUMNS],
  ['departments', DEPARTMENT_COLUMNS],
  ['users', USER_COLUMNS],
]);

export function getColumnDefs(entityType: ImportableEntityType): EntityColumnDef[] {
  const defs = REGISTRY.get(entityType);
  if (!defs) throw new Error(`No column registry entry for entity type: ${entityType}`);
  return defs;
}

export function getImportColumnDefs(entityType: ImportableEntityType): EntityColumnDef[] {
  return getColumnDefs(entityType).filter((c) => !c.exportOnly);
}

export function getWritableColumnDefs(entityType: ImportableEntityType): EntityColumnDef[] {
  return getImportColumnDefs(entityType).filter(
    (c) => c.kind !== 'spec-jsonb' && c.kind !== 'custom-jsonb' && c.kind !== 'hierarchy' && c.dbColumn !== undefined,
  );
}

export function getFkColumnDefs(entityType: ImportableEntityType): EntityColumnDef[] {
  return getImportColumnDefs(entityType).filter(
    (c) => (c.kind === 'fk-resolve' || c.kind === 'hierarchy') && c.fkResolution !== undefined,
  );
}

export function getHierarchyColumnDefs(entityType: ImportableEntityType): EntityColumnDef[] {
  return getImportColumnDefs(entityType).filter((c) => c.kind === 'hierarchy');
}
