// biome-ignore lint/correctness/noUnusedImports: vitest compiles JSX with the classic runtime, so React must be imported here.
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CompanionLauncher } from '../components/companion/CompanionLauncher';

// WI-OI-120bc (Giga AI Companion): the floating launcher shows its button and stays closed until opened.

describe('CompanionLauncher', () => {
  it('renders the floating ask button, closed by default (no panel)', () => {
    const html = renderToStaticMarkup(<CompanionLauncher />);
    expect(html).toContain('Ask Giga');
    // closed: the chat panel (and its input placeholder) is not rendered yet
    expect(html).not.toContain('Show the exchange-rate table for USD');
  });
});
