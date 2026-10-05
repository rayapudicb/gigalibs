import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// WI-OI-120b: these screens follow the owner's design standard (@medusajs/ui tokens, no hard-coded colours). The
// repository-wide ratchet is scripts/verify-design-tokens.mjs; this test keeps the restyled screens clean.
const root = join(__dirname, '..', '..', '..');
const restyled = [
  'modules/product-catalogue/web/src/ProductCatalogueWorkspace.tsx',
  'apps/workflow-platform/components/parties/PartyWorkspace.tsx',
  'apps/workflow-platform/components/configuration/ApplicationDictionaryWorkbench.tsx',
  'packages/configuration-react/src/DictionaryRenderer.tsx',
];
const HARD_CODED =
  /(?<![\w-])(?:[a-z-]+:)*(?:bg|text|border|border-[trblxy]|ring|ring-offset|divide|from|via|to|fill|stroke|outline|placeholder|decoration|shadow|accent|caret)-(?:(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white)(?:-\d{2,3})?(?:\/\d{1,3})?|\[(?:#|rgb|hsl)[^\]]*\])(?![\w-])/g;

describe('design standard (WI-OI-120b)', () => {
  it.each(restyled)('%s uses ui-* tokens and no hard-coded colours', (file) => {
    const source = readFileSync(join(root, file), 'utf8');
    expect(source.match(HARD_CODED) ?? []).toEqual([]);
    expect(source).toMatch(/(?:bg|text|border)-ui-/);
  });

  it('the pattern catches hard-coded colours and ignores tokens', () => {
    const sample = 'bg-ui-bg-base text-ui-fg-muted hover:bg-zinc-800 text-white bg-black/40 border-[#333] to-do';
    expect(sample.match(HARD_CODED)).toEqual(['hover:bg-zinc-800', 'text-white', 'bg-black/40', 'border-[#333]']);
  });
});
