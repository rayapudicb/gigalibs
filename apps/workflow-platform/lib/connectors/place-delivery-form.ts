/**
 * WI-OI-105e: which fields of a pulled record make it a Geospatial place. Connector Hub validates the settings again;
 * this only shapes the form and catches the obvious before saving.
 */

export interface PlaceDeliveryForm {
  readonly nodeTypeCode: string;
  readonly nodeTypeField: string;
  readonly nameField: string;
  readonly geometryField: string;
  readonly codeField: string;
  readonly parentField: string;
}

export interface PlaceDeliverySettings {
  readonly nodeTypeCode: string;
  readonly nodeTypeField?: string;
  readonly nameField: string;
  readonly geometryField: string;
  readonly codeField?: string;
  readonly parentField?: string;
}

const FIELD_PATH = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*){0,7}$/;

export const EMPTY_PLACE_DELIVERY: PlaceDeliveryForm = { nodeTypeCode: '', nodeTypeField: '', nameField: '', geometryField: '', codeField: '', parentField: '' };

export function placeFormFrom(settings: unknown): PlaceDeliveryForm {
  if (!settings || typeof settings !== 'object') return EMPTY_PLACE_DELIVERY;
  const value = settings as Record<string, unknown>;
  const text = (key: string) => (typeof value[key] === 'string' ? (value[key] as string) : '');
  return { nodeTypeCode: text('nodeTypeCode'), nodeTypeField: text('nodeTypeField'), nameField: text('nameField'), geometryField: text('geometryField'), codeField: text('codeField'), parentField: text('parentField') };
}

/** The settings to save, or the first problem to show. */
export function placeSettingsFrom(form: PlaceDeliveryForm): PlaceDeliverySettings | { readonly error: string } {
  const nodeTypeCode = form.nodeTypeCode.trim();
  if (!nodeTypeCode) return { error: 'Give the place type every record becomes, such as FIELD.' };
  const fields = { nodeTypeField: form.nodeTypeField.trim(), nameField: form.nameField.trim(), geometryField: form.geometryField.trim(), codeField: form.codeField.trim(), parentField: form.parentField.trim() };
  if (!fields.nameField) return { error: 'Name the field that holds each place’s name.' };
  if (!fields.geometryField) return { error: 'Name the field that holds each place’s shape (GeoJSON or WKT).' };
  for (const [key, path] of Object.entries(fields)) {
    if (path && !FIELD_PATH.test(path)) return { error: `“${path}” is not a field name or dot path (${key.replace('Field', '')}).` };
  }
  return {
    nodeTypeCode,
    ...(fields.nodeTypeField ? { nodeTypeField: fields.nodeTypeField } : {}),
    nameField: fields.nameField,
    geometryField: fields.geometryField,
    ...(fields.codeField ? { codeField: fields.codeField } : {}),
    ...(fields.parentField ? { parentField: fields.parentField } : {}),
  };
}
