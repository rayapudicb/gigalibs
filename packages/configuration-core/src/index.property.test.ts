import type { ConfigurationDefinition, ConfigurationField } from '@gigalibs/contracts';
import { describe, expect, it } from 'vitest';
import { compileConfiguration, validateConfigurationValues } from './index.js';

const FUZZ_SEED = 0x5eedc0de;
const ARBITRARY_DOCUMENT_RUNS = 600;
const VALID_DEFINITION_RUNS = 180;

type FieldType = ConfigurationField['type'];
type Random = () => number;

const componentByType: Record<FieldType, ConfigurationField['component']> = {
  TEXT: 'text-input',
  TEXTAREA: 'textarea',
  NUMBER: 'number-input',
  INTEGER: 'number-input',
  BOOLEAN: 'checkbox',
  DATE: 'date-input',
  DATETIME: 'datetime-input',
  EMAIL: 'text-input',
  PHONE: 'text-input',
  URL: 'text-input',
  CURRENCY: 'number-input',
  SELECT: 'select',
  MULTI_SELECT: 'multi-select',
};
const fieldTypes = Object.keys(componentByType) as FieldType[];
const hostileStrings = [
  '',
  '<script>alert(1)</script>',
  'fetch("https://invalid.example")',
  '${process.env.SECRET}',
  '\u0000',
  'a'.repeat(600),
  'normal-value',
];

describe('configuration compiler deterministic property fuzz', () => {
  it(`fails closed without throwing for ${ARBITRARY_DOCUMENT_RUNS} arbitrary JSON documents`, () => {
    const random = createRandom(FUZZ_SEED);
    for (let run = 0; run < ARBITRARY_DOCUMENT_RUNS; run += 1) {
      const candidate = arbitraryJson(random, 0);
      const first = compileConfiguration(candidate);
      const second = compileConfiguration(candidate);
      expect(first, `non-deterministic compiler result at run ${run}`).toEqual(second);
      expect(first.valid || first.findings.length > 0, `fail-open result at run ${run}`).toBe(true);
    }
  });

  it(`preserves checksums across key ordering for ${VALID_DEFINITION_RUNS} generated definitions`, () => {
    const random = createRandom(FUZZ_SEED ^ 0xa11ce);
    for (let run = 0; run < VALID_DEFINITION_RUNS; run += 1) {
      const definition = generatedDefinition(random, run);
      const reordered = reorderObjectKeys(definition, random);
      const first = compileConfiguration(definition);
      const second = compileConfiguration(reordered);

      expect(first.valid, `generated definition failed at run ${run}`).toBe(true);
      expect(second.valid, `reordered definition failed at run ${run}`).toBe(true);
      expect(second.manifest?.checksum, `checksum drift at run ${run}`).toBe(
        first.manifest?.checksum,
      );
    }
  });

  it(`keeps runtime validation deterministic for ${VALID_DEFINITION_RUNS} generated manifests`, () => {
    const random = createRandom(FUZZ_SEED ^ 0xc0ffee);
    for (let run = 0; run < VALID_DEFINITION_RUNS; run += 1) {
      const compiled = compileConfiguration(generatedDefinition(random, run));
      expect(compiled.valid, `generated definition failed at run ${run}`).toBe(true);
      const manifest = compiled.manifest;
      if (!manifest) throw new Error(`Generated definition lacked a manifest at run ${run}.`);
      const values = Object.fromEntries(
        manifest.fields.map((field) => [field.key, arbitraryJson(random, 2)]),
      );
      if (run % 3 === 0) values['unknown-field'] = arbitraryJson(random, 1);

      const first = validateConfigurationValues(manifest, values);
      const second = validateConfigurationValues(manifest, structuredClone(values));
      expect(second, `non-deterministic runtime validation at run ${run}`).toEqual(first);
    }
  });
});

function generatedDefinition(random: Random, run: number): ConfigurationDefinition {
  const fieldCount = 1 + pickInteger(random, 30);
  const fields = Array.from({ length: fieldCount }, (_, index) => generatedField(random, index));
  for (let index = 1; index < fields.length; index += 1) {
    if (random() < 0.35) {
      const current = fields[index];
      const previous = fields[index - 1];
      if (!current || !previous) throw new Error('Generated field sequence is incomplete.');
      fields[index] = {
        ...current,
        visibleWhen: {
          kind: 'PREDICATE',
          fieldKey: previous.key,
          operator: random() < 0.5 ? 'IS_EMPTY' : 'IS_NOT_EMPTY',
        },
      };
    }
  }
  const firstField = fields[0];
  if (!firstField) throw new Error('Generated definitions require at least one field.');

  return {
    contractVersion: '1.0',
    moduleKey: 'tenant-apps',
    entityKey: `generated-record-${run}`,
    surfaceKey: 'custom-form',
    mode: pick(random, ['CREATE', 'EDIT', 'READ', 'LIST'] as const),
    title: `Generated definition ${run}`,
    fields,
    sections: [
      {
        key: 'generated-fields',
        title: 'Generated fields',
        columns: 1 + pickInteger(random, 3),
        fieldKeys: fields.map((field) => field.key),
      },
    ],
    ...(random() < 0.5
      ? {
          listView: {
            columnKeys: fields.slice(0, Math.min(20, fields.length)).map((field) => field.key),
            defaultSortKey: firstField.key,
            defaultSortDirection: pick(random, ['ASC', 'DESC'] as const),
          },
        }
      : {}),
  };
}

function generatedField(random: Random, index: number): ConfigurationField {
  const type = pick(random, fieldTypes);
  const field: ConfigurationField = {
    key: `generated-field-${index}`,
    label: `Generated field ${index}`,
    type,
    component: componentByType[type],
    required: random() < 0.25,
    readOnly: false,
    classification: 'INTERNAL',
  };

  if (type === 'SELECT' || type === 'MULTI_SELECT') {
    field.options = Array.from({ length: 1 + pickInteger(random, 6) }, (_, optionIndex) => ({
      value: `option-${optionIndex}`,
      label: `Option ${optionIndex}`,
    }));
  }
  if (type === 'NUMBER' || type === 'INTEGER' || type === 'CURRENCY') {
    const minimum = pickInteger(random, 100) - 50;
    field.minimum = minimum;
    field.maximum = minimum + 1 + pickInteger(random, 100);
  }
  if (['TEXT', 'TEXTAREA', 'EMAIL', 'PHONE', 'URL', 'DATE', 'DATETIME'].includes(type)) {
    const minimum = pickInteger(random, 8);
    field.minLength = minimum;
    field.maxLength = minimum + 1 + pickInteger(random, 60);
  }
  return field;
}

function arbitraryJson(random: Random, depth: number): unknown {
  const scalar = () =>
    pick(random, [
      null,
      random() < 0.5,
      pickInteger(random, 2_000) - 1_000,
      pick(random, hostileStrings),
    ] as const);
  if (depth >= 4 || random() < 0.55) return scalar();
  if (random() < 0.5) {
    return Array.from({ length: pickInteger(random, 8) }, () => arbitraryJson(random, depth + 1));
  }
  return Object.fromEntries(
    Array.from({ length: pickInteger(random, 8) }, (_, index) => [
      `property-${depth}-${index}`,
      arbitraryJson(random, depth + 1),
    ]),
  );
}

function reorderObjectKeys(value: unknown, random: Random): unknown {
  if (Array.isArray(value)) return value.map((item) => reorderObjectKeys(item, random));
  if (!value || typeof value !== 'object') return value;
  const entries = Object.entries(value as Record<string, unknown>).map(
    ([key, item]) => [key, reorderObjectKeys(item, random)] as const,
  );
  for (let index = entries.length - 1; index > 0; index -= 1) {
    const swapIndex = pickInteger(random, index + 1);
    const current = entries[index];
    const swap = entries[swapIndex];
    if (!current || !swap) throw new Error('Object-key shuffle selected an invalid index.');
    entries[index] = swap;
    entries[swapIndex] = current;
  }
  return Object.fromEntries(entries);
}

function createRandom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function pickInteger(random: Random, upperExclusive: number): number {
  return Math.floor(random() * upperExclusive);
}

function pick<const T extends readonly unknown[]>(random: Random, values: T): T[number] {
  return values[pickInteger(random, values.length)];
}
