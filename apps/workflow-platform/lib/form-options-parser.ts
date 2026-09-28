import type { ConfigurationOption } from '@gigalibs/contracts';

export type { ConfigurationOption };

/**
 * Normalizes a human label into a safe option value.
 */
export function normalizeOptionValue(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return 'opt';

  // If already a simple alphanumeric code or number, preserve it
  if (/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  const normalized = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);

  return normalized || 'opt';
}

/**
 * Parses user input from a text input, textarea, or comma-separated list into
 * valid ConfigurationOption objects ({ label, value }).
 *
 * Handles:
 * 1. Comma-separated lists: "Active, Inactive, Pending"
 * 2. Newline-separated lists: "Small\nMedium\nLarge"
 * 3. Key-value pairs: "act: Active Account, inact: Inactive Account" or "admin=Administrator"
 * 4. Semicolon-separated lists: "Choice A; Choice B; Choice C"
 * 5. Trailing/leading commas, whitespace, and duplicates
 */
export function parseOptionsInput(input: string): ConfigurationOption[] {
  if (!input || !input.trim()) return [];

  // Split into raw lines first
  const lines = input.split(/\r?\n/);
  const rawTokens: string[] = [];

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    // If line contains semicolons, split on semicolons
    if (trimmedLine.includes(';')) {
      for (const part of trimmedLine.split(';')) {
        const item = part.trim();
        if (item) rawTokens.push(item);
      }
      continue;
    }

    // Split on commas, but do not split inside quotes
    const commaParts = trimmedLine.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
    for (const part of commaParts) {
      const item = part.replace(/^["']|["']$/g, '').trim();
      if (item) rawTokens.push(item);
    }
  }

  const seenValues = new Set<string>();
  const options: ConfigurationOption[] = [];

  for (const token of rawTokens) {
    let label = token;
    let value = '';

    // Check for "value: label" or "value = label"
    const colonIndex = token.indexOf(':');
    const equalsIndex = token.indexOf('=');
    const sepIndex = colonIndex !== -1 ? colonIndex : equalsIndex;

    if (sepIndex > 0 && sepIndex < token.length - 1) {
      value = token.slice(0, sepIndex).trim();
      label = token.slice(sepIndex + 1).trim();
    } else {
      label = token.trim();
      value = normalizeOptionValue(label);
    }

    if (!value) value = normalizeOptionValue(label);
    if (!label) label = value;

    // Enforce uniqueness of option values
    let uniqueValue = value;
    let suffix = 2;
    while (seenValues.has(uniqueValue)) {
      uniqueValue = `${value}-${suffix++}`;
    }
    seenValues.add(uniqueValue);

    options.push({
      label: label.slice(0, 200),
      value: uniqueValue.slice(0, 200),
    });
  }

  return options;
}

/**
 * Formats a list of options back into a readable comma-separated string
 * for text editing.
 */
export function formatOptionsForDisplay(options: readonly ConfigurationOption[] | undefined): string {
  if (!options || options.length === 0) return '';
  return options
    .map((opt) => {
      const expectedNormalized = normalizeOptionValue(opt.label);
      // If the option has a custom explicit value different from normalized label, preserve "val: Label"
      if (opt.value && opt.value !== expectedNormalized && opt.value !== opt.label) {
        return `${opt.value}: ${opt.label}`;
      }
      return opt.label;
    })
    .join(', ');
}
