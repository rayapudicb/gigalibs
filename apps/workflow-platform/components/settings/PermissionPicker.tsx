'use client';

import { PERMISSION_CATALOGUE, platformModuleCatalog } from '@gigalibs/contracts';
import { useMemo, useState } from 'react';

/**
 * WI-OI-147 (QA-037): permissions picked by plain name, grouped by module, with a search, instead of a list of codes.
 * The stored value is still the permission code; the code shows as the tooltip for administrators who know it.
 */
const MODULE_NAMES = new Map(platformModuleCatalog.map((entry) => [entry.key, entry.navigationLabel ?? entry.name]));

function words(text: string): string {
  const plain = text.replace(/[-_]/g, ' ').trim();
  return plain.charAt(0).toUpperCase() + plain.slice(1);
}

export function permissionLabel(code: string): string {
  const parts = code.split(/[:.]/);
  if (parts.at(-1) === '*') return `Everything in ${words(parts[0] ?? code)}`;
  const action = parts.length > 1 ? parts.at(-1) ?? '' : '';
  const subject = parts.length > 2 ? parts.slice(1, -1).join(' ') : (parts[0] ?? code);
  return action ? `${words(subject)} · ${action.replace(/-/g, ' ')}` : words(subject);
}

function areaLabel(owners: readonly string[], family: string): string {
  const owner = owners.find((key) => key !== 'control-plane');
  if (owner && MODULE_NAMES.has(owner)) return MODULE_NAMES.get(owner) as string;
  return owners.includes('control-plane') ? 'Workspace' : words(family);
}

const GROUPS = (() => {
  const groups = new Map<string, string[]>();
  for (const entry of PERMISSION_CATALOGUE) {
    const area = areaLabel(entry.owners, entry.family);
    if (!groups.has(area)) groups.set(area, []);
    groups.get(area)?.push(entry.code);
  }
  return [...groups.entries()].sort(([a], [b]) => (a === 'Workspace' ? -1 : b === 'Workspace' ? 1 : a.localeCompare(b)));
})();

export function PermissionPicker({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: readonly string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState('');
  const held = new Set(value);
  const listed = useMemo(() => new Set(PERMISSION_CATALOGUE.map((entry) => entry.code)), []);
  const extra = value.filter((code) => !listed.has(code));
  const needle = query.trim().toLowerCase();
  const visible = GROUPS.map(([area, codes]) => [
    area,
    needle
      ? codes.filter((code) => `${area} ${permissionLabel(code)} ${code}`.toLowerCase().includes(needle))
      : codes,
  ] as const).filter(([, codes]) => codes.length > 0);
  const toggle = (code: string, on: boolean) =>
    onChange(on ? [...value.filter((held) => held !== code), code] : value.filter((held) => held !== code));
  const setArea = (codes: readonly string[], on: boolean) =>
    onChange(on ? [...new Set([...value, ...codes])] : value.filter((code) => !codes.includes(code)));

  return (
    <fieldset className="text-xs" disabled={disabled}>
      <legend className="font-medium text-ui-fg-base">
        {label} ({value.length})
      </legend>
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Find a permission, for example work orders"
        aria-label={`Find a permission for ${label}`}
        className="mt-1 h-8 w-full rounded-md border border-ui-border-base bg-ui-bg-field px-2"
      />
      <div className="mt-1 max-h-64 overflow-y-auto rounded-md border border-ui-border-base bg-ui-bg-base">
        {visible.map(([area, codes]) => {
          const count = codes.filter((code) => held.has(code)).length;
          return (
            <details key={area} open={needle.length > 0 || count > 0} className="border-b border-ui-border-base last:border-b-0">
              <summary className="flex cursor-pointer items-center justify-between gap-2 px-2 py-1.5 font-medium text-ui-fg-base">
                <span>
                  {area} <span className="font-normal text-ui-fg-muted">({count}/{codes.length})</span>
                </span>
                <button
                  type="button"
                  className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover"
                  onClick={(event) => {
                    event.preventDefault();
                    setArea(codes, count < codes.length);
                  }}
                >
                  {count < codes.length ? 'Select all' : 'Clear'}
                </button>
              </summary>
              <div className="grid gap-0.5 px-2 pb-2 sm:grid-cols-2">
                {codes.map((code) => (
                  <label key={code} title={code} className="flex items-center gap-1.5 text-ui-fg-subtle">
                    <input type="checkbox" checked={held.has(code)} onChange={(event) => toggle(code, event.target.checked)} />
                    {permissionLabel(code)}
                  </label>
                ))}
              </div>
            </details>
          );
        })}
        {extra.length > 0 ? (
          <div className="px-2 py-1.5">
            <p className="font-medium text-ui-fg-base">Also held (whole areas or other spellings)</p>
            {extra.map((code) => (
              <label key={code} title={code} className="flex items-center gap-1.5 text-ui-fg-subtle">
                <input type="checkbox" checked onChange={() => toggle(code, false)} />
                {permissionLabel(code)}
              </label>
            ))}
          </div>
        ) : null}
      </div>
    </fieldset>
  );
}
