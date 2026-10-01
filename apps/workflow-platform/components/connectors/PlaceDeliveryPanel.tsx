'use client';

/**
 * WI-OI-105e: send a connection's pulled records to Geospatial as places. The connection names the record fields that
 * hold each place's name, shape (GeoJSON or WKT), code and parent; Geospatial creates or updates the place linked to
 * each record. Connector Hub validates the settings and decides who may change them (connections:write).
 */

import { useState } from 'react';
import { Alert, Button, Input, Label, Text } from '@medusajs/ui';
import { requestJson } from '@/lib/client-api';
import { type PlaceDeliveryForm, placeFormFrom, placeSettingsFrom } from '@/lib/connectors/place-delivery-form';

const FIELDS: ReadonlyArray<{ key: keyof PlaceDeliveryForm; label: string; hint: string; placeholder: string }> = [
  { key: 'nodeTypeCode', label: 'Place type', hint: 'A Geospatial place type code; every record becomes this type.', placeholder: 'FIELD' },
  { key: 'nodeTypeField', label: 'Type field (optional)', hint: 'When one source lists farms and fields: the field naming each record’s place type.', placeholder: 'kind' },
  { key: 'nameField', label: 'Name field', hint: 'The field holding the place’s name.', placeholder: 'name' },
  { key: 'geometryField', label: 'Shape field', hint: 'GeoJSON or WKT: a polygon, multipolygon or point in WGS 84.', placeholder: 'geometry' },
  { key: 'codeField', label: 'Code field (optional)', hint: 'The place code; the record’s id when left empty.', placeholder: 'code' },
  { key: 'parentField', label: 'Parent field (optional)', hint: 'The id of the record for the place this one is inside, such as its farm.', placeholder: 'farm_id' },
];

export function PlaceDeliveryPanel({ connectionId, placeDelivery }: { connectionId: string; placeDelivery: unknown }) {
  const [saved, setSaved] = useState(Boolean(placeDelivery));
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<PlaceDeliveryForm>(() => placeFormFrom(placeDelivery));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const id = (name: string) => `place-${name}-${connectionId}`;

  const send = async (places: unknown, done: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await requestJson(`/api/connectors-hub/connections/${encodeURIComponent(connectionId)}/delivery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ places }),
      });
      setSaved(places !== null);
      setOpen(false);
      setNotice(done);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    const settings = placeSettingsFrom(form);
    if ('error' in settings) return setError(settings.error);
    return void send(settings, 'Records pulled from now on will also become places in Geospatial.');
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border border-ui-border-base p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Text size="small" weight="plus">Send pulled records to Geospatial as places</Text>
          <Text size="xsmall" className="text-ui-fg-subtle">
            {saved
              ? `On: each record becomes a ${form.nodeTypeCode} place named from “${form.nameField}”, shaped from “${form.geometryField}”${form.parentField ? `, inside the place of “${form.parentField}”` : ''}.`
              : 'Off. Use this for sources that list farms, fields or plots with their boundaries.'}
          </Text>
        </div>
        <div className="flex gap-2">
          {saved ? (
            <Button type="button" size="small" variant="secondary" disabled={busy} onClick={() => void send(null, 'Records stay in Connector Hub; places already made are kept.')}>
              Turn off
            </Button>
          ) : null}
          <Button type="button" size="small" variant="secondary" disabled={busy} onClick={() => setOpen(!open)}>
            {open ? 'Cancel' : saved ? 'Edit' : 'Set up'}
          </Button>
        </div>
      </div>
      {error ? <Alert variant="error">{error}</Alert> : null}
      {notice ? <Alert variant="success">{notice}</Alert> : null}
      {open ? (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {FIELDS.map((field) => (
              <div key={field.key} className="flex min-w-0 flex-col gap-1">
                <Label htmlFor={id(field.key)} size="xsmall">{field.label}</Label>
                <Input
                  id={id(field.key)}
                  size="small"
                  value={form[field.key]}
                  placeholder={field.placeholder}
                  onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}
                />
                <Text size="xsmall" className="text-ui-fg-subtle">{field.hint}</Text>
              </div>
            ))}
          </div>
          <div>
            <Button type="button" size="small" isLoading={busy} disabled={busy} onClick={save}>Save place settings</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
