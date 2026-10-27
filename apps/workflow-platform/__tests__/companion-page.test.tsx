// biome-ignore lint/correctness/noUnusedImports: vitest compiles JSX with the classic runtime, so React must be imported here.
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import CompanionPage from '../app/(app)/companion/page';

// WI-OI-120bc (Giga AI Companion): the page renders its initial ask form (no network in the initial render).

describe('CompanionPage', () => {
  it('renders the goal form', () => {
    const html = renderToStaticMarkup(<CompanionPage />);
    expect(html).toContain('Giga AI Companion');
    expect(html).toContain('Who can work at Site A tomorrow?'); // the input placeholder
    expect(html).toContain('Ask');
  });
});
