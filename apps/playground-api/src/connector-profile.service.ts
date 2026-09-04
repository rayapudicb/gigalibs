import { BadRequestException, Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: NestJS needs the runtime constructor token for dependency injection.
import { JsonSchemaService } from './json-schema.service.js';

interface ProfileResult {
  schema: Record<string, unknown>;
  maskedSample: unknown;
  classification: {
    sensitivePaths: string[];
    maskedFieldCount: number;
  };
  recordCountObserved: number;
}

const SENSITIVE_FIELD =
  /(?:^|[_\s-])(password|passwd|secret|token|api\s?key|authorization|ssn|social\s?security|tax\s?id|bank|routing|account\s?number|email|phone|date\s?of\s?birth|dob)(?:$|[_\s-])/i;

@Injectable()
export class ConnectorProfileService {
  constructor(private readonly jsonSchemaService: JsonSchemaService) {}

  profile(body: unknown, sampleLimit: number): ProfileResult {
    const records = Array.isArray(body) ? body.slice(0, sampleLimit) : [body];
    if (records.length === 0)
      throw new BadRequestException('The source returned no records to profile.');
    if (records.some((record) => !this.isRecord(record))) {
      throw new BadRequestException('Connector profiling requires JSON objects or a CSV table.');
    }
    const objectRecords = records as Array<Record<string, unknown>>;
    const schema = this.inferObjectSchema(objectRecords, 0);
    this.jsonSchemaService.validateDefinition(schema);
    const sensitivePaths = new Set<string>();
    const maskedSample = objectRecords
      .slice(0, Math.min(5, sampleLimit))
      .map((record) => this.maskRecord(record, '$', sensitivePaths, 0));
    return {
      schema,
      maskedSample: Array.isArray(body) ? maskedSample : maskedSample[0],
      classification: {
        sensitivePaths: Array.from(sensitivePaths).sort(),
        maskedFieldCount: sensitivePaths.size,
      },
      recordCountObserved: objectRecords.length,
    };
  }

  private inferObjectSchema(
    records: Array<Record<string, unknown>>,
    depth: number,
  ): Record<string, unknown> {
    if (depth > 16) return { type: 'object', properties: {}, additionalProperties: true };
    const keys = new Set(records.flatMap((record) => Object.keys(record)));
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const key of Array.from(keys).sort()) {
      const values = records.filter((record) => key in record).map((record) => record[key]);
      properties[key] = this.inferSchema(values, depth + 1);
      if (values.length === records.length) required.push(key);
    }
    return {
      type: 'object',
      properties,
      required,
      additionalProperties: false,
    };
  }

  private inferSchema(values: unknown[], depth: number): Record<string, unknown> {
    const types = Array.from(new Set(values.map((value) => this.jsonType(value)))).sort();
    if (types.length > 1) return { type: types };
    const [type = 'null'] = types;
    if (type === 'object') return this.inferObjectSchema(values.filter(this.isRecord), depth);
    if (type === 'array') {
      const items = values.flatMap((value) => (Array.isArray(value) ? value.slice(0, 100) : []));
      return {
        type: 'array',
        items:
          items.length > 0
            ? this.inferSchema(items, depth + 1)
            : { type: ['null', 'boolean', 'integer', 'number', 'string'] },
      };
    }
    if (type === 'string') {
      const strings = values.filter((value): value is string => typeof value === 'string');
      const format = this.commonFormat(strings);
      return format ? { type, format } : { type };
    }
    return { type };
  }

  private maskRecord(
    value: unknown,
    path: string,
    sensitivePaths: Set<string>,
    depth: number,
  ): unknown {
    if (depth > 16) return '[DEPTH_LIMIT]';
    if (Array.isArray(value))
      return value
        .slice(0, 10)
        .map((child, index) =>
          this.maskRecord(child, `${path}[${index}]`, sensitivePaths, depth + 1),
        );
    if (!this.isRecord(value)) {
      return typeof value === 'string' && value.length > 256 ? `${value.slice(0, 256)}…` : value;
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => {
        const childPath = `${path}.${key}`;
        if (SENSITIVE_FIELD.test(key.replace(/([a-z0-9])([A-Z])/g, '$1_$2'))) {
          sensitivePaths.add(childPath);
          return [key, '[REDACTED]'];
        }
        return [key, this.maskRecord(child, childPath, sensitivePaths, depth + 1)];
      }),
    );
  }

  private commonFormat(values: string[]): string | null {
    if (values.length === 0) return null;
    if (
      values.every(
        (value) => !Number.isNaN(Date.parse(value)) && /(?:Z|[+-]\d{2}:\d{2})$/.test(value),
      )
    )
      return 'date-time';
    if (values.every((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))) return 'date';
    if (values.every((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))) return 'email';
    if (
      values.every((value) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
      )
    )
      return 'uuid';
    return null;
  }

  private jsonType(value: unknown): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    if (this.isRecord(value)) return 'object';
    if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
    if (typeof value === 'boolean') return 'boolean';
    return 'string';
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }
}
