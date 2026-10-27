'use client';

import type { GenerativeUINode } from '@gigalibs/contracts';
import { Alert, Badge, Button, Heading, Table, Text } from '@medusajs/ui';
// biome-ignore lint/style/useImportType: vitest compiles this file's JSX with the classic runtime, so React must be a runtime import, not a type-only one.
import * as React from 'react';

// WI-OI-120bc (Giga AI Companion): the generative-UI renderer. It turns the agent's validated, allow-listed
// GenerativeUINode description into vetted @medusajs/ui components — there is no path to raw HTML or script, so a
// model's output can only ever become structured, themed content. Colours come only from ui-* design tokens. Action
// buttons emit their actionId back to the caller (onAction); they never carry a URL or code.

type Tone = 'default' | 'muted' | 'success' | 'warning' | 'danger';

const TONE_TEXT: Record<Tone, string> = {
  default: 'text-ui-fg-base',
  muted: 'text-ui-fg-subtle',
  success: 'text-ui-tag-green-text',
  warning: 'text-ui-tag-orange-text',
  danger: 'text-ui-tag-red-text',
};

const NOTE_VARIANT: Record<Tone, 'info' | 'success' | 'warning' | 'error'> = {
  default: 'info',
  muted: 'info',
  success: 'success',
  warning: 'warning',
  danger: 'error',
};

const ACTION_VARIANT: Record<
  'primary' | 'secondary' | 'danger',
  'primary' | 'secondary' | 'danger'
> = {
  primary: 'primary',
  secondary: 'secondary',
  danger: 'danger',
};

export interface GenerativeUIProps {
  readonly node: GenerativeUINode;
  /** Called when an action button is pressed, with the node's actionId. The host relays it back to the agent. */
  readonly onAction?: (actionId: string) => void;
}

/** Render one validated generative-UI node (recursive for `group`). */
export function GenerativeUI({ node, onAction }: GenerativeUIProps): React.ReactElement {
  switch (node.kind) {
    case 'heading':
      return <Heading level={`h${node.level}`}>{node.text}</Heading>;

    case 'text':
      return <Text className={TONE_TEXT[node.tone ?? 'default']}>{node.text}</Text>;

    case 'note':
      return (
        <Alert variant={NOTE_VARIANT[node.tone]}>
          <Text>{node.text}</Text>
        </Alert>
      );

    case 'stat':
      return (
        <div className="flex flex-col gap-y-1 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-3">
          <Text size="small" className="text-ui-fg-muted">
            {node.label}
          </Text>
          <div className="flex items-baseline gap-x-2">
            <Heading level="h2">{node.value}</Heading>
            {node.delta ? <Badge size="2xsmall">{node.delta}</Badge> : null}
          </div>
        </div>
      );

    case 'fields':
      return (
        <dl className="grid grid-cols-[minmax(0,12rem)_1fr] gap-x-4 gap-y-2">
          {node.items.map((item) => (
            <div key={item.label} className="contents">
              <dt className="text-ui-fg-muted">
                <Text size="small">{item.label}</Text>
              </dt>
              <dd>
                <Text size="small" className="text-ui-fg-base">
                  {item.value}
                </Text>
              </dd>
            </div>
          ))}
        </dl>
      );

    case 'table':
      return (
        <Table>
          <Table.Header>
            <Table.Row>
              {node.columns.map((col) => (
                <Table.HeaderCell key={col}>{col}</Table.HeaderCell>
              ))}
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {node.rows.map((row) => (
              <Table.Row key={row.join('\u0001')}>
                {node.columns.map((col, c) => (
                  <Table.Cell key={col}>{row[c] ?? ''}</Table.Cell>
                ))}
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      );

    case 'actions':
      return (
        <div className="flex flex-wrap gap-2">
          {node.items.map((action) => (
            <Button
              key={action.actionId}
              variant={ACTION_VARIANT[action.style ?? 'secondary']}
              size="small"
              onClick={() => onAction?.(action.actionId)}
            >
              {action.label}
            </Button>
          ))}
        </div>
      );

    case 'group':
      return (
        <section className="flex flex-col gap-y-3">
          {node.heading ? <Heading level="h3">{node.heading}</Heading> : null}
          {node.children.map((child, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a static descriptor rendered wholesale; children have no id, and the position is a stable key.
            <GenerativeUI key={`child-${i}`} node={child} onAction={onAction} />
          ))}
        </section>
      );
  }
}
