'use client';

import { Button, Heading, Tabs, Text } from '@medusajs/ui';
import type { ReactNode } from 'react';

// WI-OI-145 (S4): the page frame every module screen uses, after Medusa Admin: a header with the screen's title (the
// same words as its sidebar entry), an optional one-line description and its actions on the right; one style of in-page
// tabs; one empty state and one error state. The shell's layout gives every page its padding and width, so a page
// never adds its own.

export interface ModulePageProps {
  /** The screen's name, exactly as its sidebar entry reads. */
  readonly title: string;
  /** One sentence saying what the screen is for. */
  readonly description?: ReactNode;
  /** Buttons for the screen, at most one of them primary. */
  readonly actions?: ReactNode;
  readonly children?: ReactNode;
}

export function ModulePage({ title, description, actions, children }: ModulePageProps) {
  return (
    <div className="flex flex-col gap-4" data-module-page="">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Heading level="h1">{title}</Heading>
          {description ? (
            <Text size="small" className="mt-1 max-w-3xl text-ui-fg-subtle">
              {description}
            </Text>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      {children}
    </div>
  );
}

export interface PageTab<K extends string> {
  readonly key: K;
  readonly label: string;
  readonly count?: number;
}

export interface PageTabsProps<K extends string> {
  readonly tabs: readonly PageTab<K>[];
  readonly value: K;
  readonly onChange: (key: K) => void;
  /** What the tabs switch between, for assistive technology. */
  readonly label: string;
}

/** Views inside one screen (never a module's own navigation, which is the sidebar). */
export function PageTabs<K extends string>({ tabs, value, onChange, label }: PageTabsProps<K>) {
  return (
    <Tabs value={value} onValueChange={(next) => onChange(next as K)}>
      <Tabs.List aria-label={label} className="flex-wrap">
        {tabs.map((tab) => (
          <Tabs.Trigger key={tab.key} value={tab.key}>
            {tab.label}
            {tab.count !== undefined ? <span className="ml-1.5 tabular-nums text-ui-fg-muted">{tab.count}</span> : null}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
    </Tabs>
  );
}

export interface EmptyStateProps {
  readonly title: string;
  readonly description?: ReactNode;
  readonly action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg bg-ui-bg-base px-6 py-10 text-center shadow-borders-base">
      <Text size="small" weight="plus" className="text-ui-fg-base">
        {title}
      </Text>
      {description ? (
        <Text size="small" className="max-w-md text-ui-fg-subtle">
          {description}
        </Text>
      ) : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export interface ErrorStateProps {
  /** What happened and what to do, in plain words. */
  readonly message: string;
  readonly title?: string;
  readonly onRetry?: () => void;
}

export function ErrorState({ message, title = 'This could not be loaded', onRetry }: ErrorStateProps) {
  return (
    <div role="alert" className="flex flex-col items-start gap-1 rounded-lg bg-ui-bg-base px-6 py-5 shadow-borders-base">
      <Text size="small" weight="plus" className="text-ui-fg-error">
        {title}
      </Text>
      <Text size="small" className="text-ui-fg-subtle">
        {message}
      </Text>
      {onRetry ? (
        <Button size="small" variant="secondary" className="mt-2" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

/**
 * A plain sentence for a failed request, never the bare status code: what the person sees when a screen cannot load.
 * A server's own message is kept when it is a sentence written for people.
 */
export function plainRequestError(status: number, serverMessage?: string | null): string {
  if (serverMessage && /^[A-Z][^{}<>]*[.!?]$/.test(serverMessage.trim()) && !/^Request failed/i.test(serverMessage))
    return serverMessage.trim();
  if (status === 401) return 'Your session has ended. Sign in again.';
  if (status === 403) return 'You do not have permission to see this. Ask your workspace administrator.';
  if (status === 404) return 'This is not set up for your workspace yet. Ask your workspace administrator.';
  if (status === 409) return 'Someone changed this at the same time. Reload and try again.';
  if (status === 429) return 'Too many requests. Wait a moment and try again.';
  if (status >= 500) return 'The service is not responding. Try again in a moment.';
  return 'The request was refused. Check the details and try again.';
}

// Words that keep their usual spelling when a code is shown to people.
const CODE_WORDS: Readonly<Record<string, string>> = {
  API: 'API', COAP: 'CoAP', CSV: 'CSV', DAG: 'DAG', ERP: 'ERP', HTTP: 'HTTP', HTTPS: 'HTTPS', ID: 'ID', IOT: 'IoT',
  KPI: 'KPI', LOTO: 'LOTO', MQTT: 'MQTT', MTLS: 'mTLS', OAUTH: 'OAuth', OAUTH2: 'OAuth 2', OPC: 'OPC', PO: 'PO',
  QR: 'QR', RMA: 'RMA', SAML: 'SAML', SCIM: 'SCIM', SFTP: 'SFTP', SMS: 'SMS', SSO: 'SSO', TCP: 'TCP', UA: 'UA', UDP: 'UDP',
  URL: 'URL', WO: 'WO',
};

/**
 * A SCREAMING_SNAKE or kebab code as people read it (WI-OI-145): `MODBUS_TCP` → "Modbus TCP", `STEP_ADDED` →
 * "Step added", `pending-approval` → "Pending approval". Anything else is returned unchanged.
 */
export function codeLabel(code: string): string {
  if (!/^[A-Za-z0-9]+(?:[_-][A-Za-z0-9]+)*$/.test(code) || !/[_-]|^[A-Z0-9]+$/.test(code)) return code;
  const words = code.split(/[_-]/).map((word) => word.toUpperCase());
  return words
    .map((word, index) => CODE_WORDS[word] ?? (index === 0 ? word.charAt(0) + word.slice(1).toLowerCase() : word.toLowerCase()))
    .join(' ');
}
