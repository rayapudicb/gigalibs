// biome-ignore lint/correctness/noUnusedImports: vitest compiles JSX with the classic runtime, so React must be imported here.
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CompanionChat } from '../components/companion/CompanionChat';

// CompanionChat uses next/navigation's useRouter, which needs the app-router context the static renderer lacks.
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => undefined }) }));

// WI-OI-120bc (Giga AI Companion): the chat surface (used by both the /companion page and the floating launcher)
// renders its goal form.

describe('CompanionChat', () => {
  it('renders the goal form', () => {
    const html = renderToStaticMarkup(<CompanionChat />);
    expect(html).toContain('Giga AI Companion');
    expect(html).toContain('Show the exchange-rate table for USD'); // the input placeholder
    expect(html).toContain('Ask');
  });
});
