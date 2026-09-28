'use client';

import { type PlaceOption, PlaceSelect, usePlaces } from '@gigalibs/web-sdk';
import { ArrowPath, ExclamationCircle, Spinner } from '@medusajs/icons';
import { Alert, Button, Container, Heading, Label, Text } from '@medusajs/ui';
import type { ReactNode } from 'react';
import type { CmmsApiError } from '../api';

// Native selects keep FormData and empty options; this matches the Medusa Input field style.
export const selectClass =
  'h-8 w-full rounded-md bg-ui-bg-field px-2 txt-compact-small text-ui-fg-base shadow-borders-base outline-none transition-fg hover:bg-ui-bg-field-hover focus-visible:shadow-borders-interactive-with-active';

export function Field({
  id,
  label,
  className = '',
  children,
}: { id: string; label: string; className?: string; children: ReactNode }) {
  return (
    <div className={`flex flex-col gap-y-1.5 ${className}`}>
      <Label htmlFor={id} size="xsmall" weight="plus">
        {label}
      </Label>
      {children}
    </div>
  );
}

export function LoadingState({ label = 'Loading maintenance records…' }: { label?: string }) {
  return (
    <Container className="flex items-center gap-3 p-6" aria-busy="true">
      <Spinner className="animate-spin text-ui-fg-subtle" />
      <Text size="small" className="text-ui-fg-subtle">
        {label}
      </Text>
    </Container>
  );
}

/** Denied, unavailable and failed states, each with the next step the user can take. */
export function ErrorState({ error, retry }: { error: CmmsApiError; retry: () => void }) {
  const denied = error.status === 403;
  const unavailable = error.status === 502 || error.status === 503;
  return (
    <Container className="p-6" role="alert">
      <div className="flex items-start gap-3">
        <ExclamationCircle className="mt-0.5 text-ui-fg-error" />
        <div>
          <Heading level="h2">
            {denied
              ? 'You do not have access to this maintenance area'
              : unavailable
                ? 'Maintenance service unavailable'
                : 'Could not load maintenance records'}
          </Heading>
          <Text size="small" className="mt-1 text-ui-fg-subtle">
            {denied
              ? 'Ask a tenant administrator for Asset & Maintenance access, or open a workspace where the module is enabled.'
              : error.message}
          </Text>
          {denied ? null : (
            <Button type="button" size="small" variant="secondary" className="mt-4" onClick={retry}>
              <ArrowPath /> Try again
            </Button>
          )}
        </div>
      </div>
    </Container>
  );
}

export function EmptyState({
  title,
  text,
  action,
}: { title: string; text: string; action?: ReactNode }) {
  return (
    <div className="mt-4 rounded-lg border border-dashed border-ui-border-strong bg-ui-bg-subtle p-6">
      <Text weight="plus">{title}</Text>
      <Text size="small" className="mt-2 text-ui-fg-subtle">
        {text}
      </Text>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/** Shows the error; a version conflict explains that the record changed and offers a reload. */
export function ActionError({
  error,
  onReload,
}: { error: CmmsApiError | null; onReload?: () => void }) {
  if (!error) return null;
  const conflict = error.status === 409 && error.errorCode === 'CMMS_VERSION_CONFLICT';
  return (
    <Alert variant={conflict ? 'warning' : 'error'} role="alert" className="mt-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span>{error.message}</span>
        {conflict && onReload ? (
          <Button type="button" size="small" variant="secondary" onClick={onReload}>
            Reload
          </Button>
        ) : null}
      </div>
    </Alert>
  );
}

// Places come from the core place-picker slot (WI-OI-083b), never from the Geospatial module directly. CMMS keeps its
// own names for them; without Geospatial the picker is empty and names fall back to a short id.
export type SiteOption = PlaceOption;
export function useSites(): {
  sites: readonly SiteOption[];
  siteName: (siteRef: string | null) => string;
} {
  const { places, placeName } = usePlaces();
  return { sites: places, siteName: placeName };
}
export function SiteSelect(props: {
  id: string;
  name: string;
  defaultValue?: string | null;
  sites: readonly SiteOption[];
  label?: string;
}) {
  const { sites, ...rest } = props;
  return <PlaceSelect {...rest} places={sites} />;
}

/** The signed-in user's id, used as the default worker for labour entries. */
export { useCurrentUserId } from '@gigalibs/web-sdk';

export function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : '—';
}

export function formatMoney(amount: number, currencyCode: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode }).format(
      amount,
    );
  } catch {
    return `${amount.toFixed(2)} ${currencyCode}`;
  }
}

/** Optional form text: trimmed, or undefined when blank so the API default applies. */
export function optionalText(value: FormDataEntryValue | null): string | undefined {
  const text = typeof value === 'string' ? value.trim() : '';
  return text ? text : undefined;
}

export function optionalNumber(value: FormDataEntryValue | null): number | undefined {
  const text = typeof value === 'string' ? value.trim() : '';
  return text ? Number(text) : undefined;
}
