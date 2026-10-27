import type { GenerativeUINode } from '@gigalibs/contracts';
// biome-ignore lint/correctness/noUnusedImports: vitest compiles JSX with the classic runtime, so React must be imported here.
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GenerativeUI } from '../components/companion/GenerativeUI';

// WI-OI-120bc (Giga AI Companion): the generative-UI renderer draws only the allow-listed nodes, with ui-* tokens, and
// escapes content — a model's output can never become markup or behaviour.

const html = (node: GenerativeUINode) => renderToStaticMarkup(<GenerativeUI node={node} />);

describe('GenerativeUI renderer', () => {
  it('renders a group of allow-listed nodes with design tokens', () => {
    const out = html({
      kind: 'group',
      heading: 'Overdue work',
      children: [
        { kind: 'text', text: 'Three are overdue.', tone: 'danger' },
        { kind: 'stat', label: 'Overdue', value: '3', delta: '+1' },
        { kind: 'table', columns: ['WO', 'Asset'], rows: [['WO-1', 'Pump A']] },
        { kind: 'actions', items: [{ label: 'Assign', actionId: 'assign', style: 'primary' }] },
      ],
    });
    expect(out).toContain('Overdue work');
    expect(out).toContain('text-ui-tag-red-text'); // the danger tone resolves to a ui-* token, not a raw colour
    expect(out).toContain('WO-1');
    expect(out).toContain('Pump A');
    expect(out).toContain('Assign');
    expect(out).toContain('+1');
  });

  it('renders a note as a themed alert', () => {
    expect(html({ kind: 'note', text: 'Saved.', tone: 'success' })).toContain('Saved.');
  });

  it('escapes text — a model cannot inject markup through a text node', () => {
    const out = html({ kind: 'text', text: '<script>alert(1)</script>' });
    expect(out).not.toContain('<script>alert(1)</script>');
    expect(out).toContain('&lt;script&gt;');
  });
});
