import type { ConfigurationField } from '@gigalibs/contracts';

export type MaskingPolicy = 'NONE' | 'MASK_LAST_FOUR' | 'REDACTED';

export interface FormatConfigurationOptions {
  maskPolicy?: MaskingPolicy | undefined;
  locale?: string | undefined;
  currency?: string | undefined;
}

/**
 * Format a configuration field value for display.
 *
 * @param options.locale  BCP-47 locale tag (e.g. 'en-US', 'de-DE').  Defaults to 'en-US'
 *                        — always pass the tenant's locale explicitly so non-US tenants
 *                        receive correct number and date formatting.
 * @param options.currency ISO-4217 currency code.  Defaults to 'USD' — always pass the
 *                        tenant's settlement currency explicitly.
 */
export function maskConfigurationValue(
  field: ConfigurationField,
  value: unknown,
  options: FormatConfigurationOptions = {},
): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  const maskPolicy =
    options.maskPolicy ??
    (field.classification === 'RESTRICTED' || field.classification === 'CONFIDENTIAL'
      ? 'MASK_LAST_FOUR'
      : 'NONE');

  if (maskPolicy === 'REDACTED') {
    return '••••••••';
  }

  if (field.type === 'BOOLEAN') {
    return value ? 'Yes' : 'No';
  }

  if (field.type === 'SELECT') {
    const opt = field.options?.find((o) => o.value === value);
    const label = opt ? opt.label : String(value);
    if (maskPolicy === 'MASK_LAST_FOUR') return maskStringLastFour(label);
    return label;
  }

  if (field.type === 'MULTI_SELECT') {
    if (!Array.isArray(value)) return '—';
    const labels = value.map((v) => {
      const opt = field.options?.find((o) => o.value === v);
      return opt ? opt.label : String(v);
    });
    return labels.join(', ');
  }

  if (field.type === 'CURRENCY') {
    const num = Number(value);
    if (!Number.isFinite(num)) return '—';
    const curr = options.currency ?? 'USD' /* TODO: pass tenant currency from context */;
    const formatted = new Intl.NumberFormat(options.locale ?? 'en-US' /* TODO: pass tenant locale from context */, {
      style: 'currency',
      currency: curr,
    }).format(num);
    if (maskPolicy === 'MASK_LAST_FOUR') return maskStringLastFour(formatted);
    return formatted;
  }

  if (field.type === 'NUMBER' || field.type === 'INTEGER') {
    const num = Number(value);
    if (!Number.isFinite(num)) return '—';
    const formatted = new Intl.NumberFormat(options.locale ?? 'en-US' /* TODO: pass tenant locale from context */).format(num);
    if (maskPolicy === 'MASK_LAST_FOUR') return maskStringLastFour(formatted);
    return formatted;
  }

  if (field.type === 'DATE' || field.type === 'DATETIME') {
    try {
      const d = new Date(String(value));
      if (isNaN(d.getTime())) return String(value);
      return field.type === 'DATE'
        ? d.toLocaleDateString(options.locale ?? 'en-US' /* TODO: pass tenant locale from context */)
        : d.toLocaleString(options.locale ?? 'en-US' /* TODO: pass tenant locale from context */);
    } catch {
      return String(value);
    }
  }

  const str = String(value);
  if (maskPolicy === 'MASK_LAST_FOUR') {
    return maskStringLastFour(str);
  }
  return str;
}

function maskStringLastFour(str: string): string {
  if (str.length <= 4) return str;
  const lastFour = str.slice(-4);
  return '•••• ' + lastFour;
}
