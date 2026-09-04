import { BadRequestException, Injectable } from '@nestjs/common';

interface ValidationIssue {
  path: string;
  code: string;
  message: string;
}

interface CompatibilityReport {
  compatible: boolean;
  mode: 'BACKWARD' | 'FORWARD' | 'FULL' | 'NONE';
  issues: ValidationIssue[];
}

type JsonSchema = Record<string, unknown>;

const SUPPORTED_KEYWORDS = new Set([
  '$id',
  '$schema',
  'title',
  'description',
  'type',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'minItems',
  'maxItems',
  'minLength',
  'maxLength',
  'pattern',
  'format',
  'enum',
  'const',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minProperties',
  'maxProperties',
  'anyOf',
  'oneOf',
  'allOf',
]);

const SCALAR_TYPES = new Set(['null', 'boolean', 'object', 'array', 'number', 'integer', 'string']);
const FORMATS = new Set(['date', 'date-time', 'email', 'uri', 'uuid']);

@Injectable()
export class JsonSchemaService {
  validateDefinition(schema: JsonSchema): void {
    this.inspectDefinition(schema, '$', 0);
    if (schema.type !== 'object') {
      throw new BadRequestException('The root data contract schema must have type "object".');
    }
  }

  validatePayload(schema: JsonSchema, payload: unknown): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    this.validateValue(schema, payload, '$', issues, 0);
    return issues.slice(0, 100);
  }

  compatibility(
    previous: JsonSchema | null,
    next: JsonSchema,
    mode: CompatibilityReport['mode'],
  ): CompatibilityReport {
    if (!previous || mode === 'NONE') return { compatible: true, mode, issues: [] };
    const issues: ValidationIssue[] = [];
    if (mode === 'BACKWARD' || mode === 'FULL') {
      this.compareObjectSchemas(previous, next, '$', 'BACKWARD', issues);
    }
    if (mode === 'FORWARD' || mode === 'FULL') {
      this.compareObjectSchemas(next, previous, '$', 'FORWARD', issues);
    }
    return { compatible: issues.length === 0, mode, issues };
  }

  private inspectDefinition(schema: JsonSchema, path: string, depth: number): void {
    if (depth > 24) throw new BadRequestException(`Schema depth exceeds 24 at ${path}.`);
    for (const key of Object.keys(schema)) {
      if (!SUPPORTED_KEYWORDS.has(key)) {
        throw new BadRequestException(`Unsupported JSON Schema keyword '${key}' at ${path}.`);
      }
    }
    const types = this.schemaTypes(schema);
    if (types.length === 0 || types.some((type) => !SCALAR_TYPES.has(type))) {
      throw new BadRequestException(`A supported type is required at ${path}.`);
    }
    if (
      schema.format !== undefined &&
      (typeof schema.format !== 'string' || !FORMATS.has(schema.format))
    ) {
      throw new BadRequestException(`Unsupported string format at ${path}.`);
    }
    if (schema.pattern !== undefined) {
      if (typeof schema.pattern !== 'string')
        throw new BadRequestException(`Pattern must be a string at ${path}.`);
      try {
        new RegExp(schema.pattern);
      } catch {
        throw new BadRequestException(`Pattern is not a valid regular expression at ${path}.`);
      }
    }
    if (types.includes('object')) {
      if (!this.isRecord(schema.properties)) {
        throw new BadRequestException(`Object properties are required at ${path}.`);
      }
      const propertyNames = new Set(Object.keys(schema.properties));
      const required = schema.required ?? [];
      if (
        !Array.isArray(required) ||
        required.some((key) => typeof key !== 'string' || !propertyNames.has(key))
      ) {
        throw new BadRequestException(
          `Required fields must reference declared properties at ${path}.`,
        );
      }
      if (
        schema.additionalProperties !== undefined &&
        typeof schema.additionalProperties !== 'boolean'
      ) {
        throw new BadRequestException(`additionalProperties must be a boolean at ${path}.`);
      }
      for (const [key, child] of Object.entries(schema.properties)) {
        if (!this.isRecord(child))
          throw new BadRequestException(`Property schema must be an object at ${path}.${key}.`);
        this.inspectDefinition(child, `${path}.${key}`, depth + 1);
      }
    }
    if (types.includes('array')) {
      if (!this.isRecord(schema.items))
        throw new BadRequestException(`Array items are required at ${path}.`);
      this.inspectDefinition(schema.items, `${path}[]`, depth + 1);
    }
    for (const combinator of ['anyOf', 'oneOf', 'allOf'] as const) {
      const alternatives = schema[combinator];
      if (alternatives === undefined) continue;
      if (!Array.isArray(alternatives) || alternatives.length < 1 || alternatives.length > 20) {
        throw new BadRequestException(
          `${combinator} must contain between 1 and 20 schemas at ${path}.`,
        );
      }
      alternatives.forEach((alternative, index) => {
        if (!this.isRecord(alternative))
          throw new BadRequestException(`Invalid ${combinator} schema at ${path}.`);
        this.inspectDefinition(alternative, `${path}.${combinator}[${index}]`, depth + 1);
      });
    }
  }

  private validateValue(
    schema: JsonSchema,
    value: unknown,
    path: string,
    issues: ValidationIssue[],
    depth: number,
  ): void {
    if (issues.length >= 100 || depth > 32) return;
    const types = this.schemaTypes(schema);
    if (!types.some((type) => this.matchesType(value, type))) {
      issues.push({ path, code: 'TYPE_MISMATCH', message: `Expected ${types.join(' or ')}.` });
      return;
    }
    if (schema.const !== undefined && !this.equalJson(value, schema.const)) {
      issues.push({
        path,
        code: 'CONST_MISMATCH',
        message: 'Value does not match the required constant.',
      });
    }
    if (
      Array.isArray(schema.enum) &&
      !schema.enum.some((candidate) => this.equalJson(value, candidate))
    ) {
      issues.push({ path, code: 'ENUM_MISMATCH', message: 'Value is not in the allowed set.' });
    }
    if (typeof value === 'string') this.validateString(schema, value, path, issues);
    if (typeof value === 'number') this.validateNumber(schema, value, path, issues);
    if (Array.isArray(value)) this.validateArray(schema, value, path, issues, depth);
    if (this.isRecord(value)) this.validateObject(schema, value, path, issues, depth);

    for (const combinator of ['anyOf', 'oneOf', 'allOf'] as const) {
      const alternatives = schema[combinator];
      if (!Array.isArray(alternatives)) continue;
      const matches = alternatives.filter((alternative) => {
        const candidateIssues: ValidationIssue[] = [];
        this.validateValue(alternative as JsonSchema, value, path, candidateIssues, depth + 1);
        return candidateIssues.length === 0;
      }).length;
      const valid =
        combinator === 'allOf'
          ? matches === alternatives.length
          : combinator === 'oneOf'
            ? matches === 1
            : matches > 0;
      if (!valid)
        issues.push({
          path,
          code: 'COMBINATOR_MISMATCH',
          message: `${combinator} constraint failed.`,
        });
    }
  }

  private validateObject(
    schema: JsonSchema,
    value: Record<string, unknown>,
    path: string,
    issues: ValidationIssue[],
    depth: number,
  ) {
    const properties = this.isRecord(schema.properties) ? schema.properties : {};
    const required = Array.isArray(schema.required)
      ? schema.required.filter((item): item is string => typeof item === 'string')
      : [];
    for (const key of required) {
      if (!(key in value))
        issues.push({
          path: `${path}.${key}`,
          code: 'REQUIRED',
          message: 'Required value is missing.',
        });
    }
    if (
      typeof schema.minProperties === 'number' &&
      Object.keys(value).length < schema.minProperties
    ) {
      issues.push({ path, code: 'MIN_PROPERTIES', message: 'Object has too few properties.' });
    }
    if (
      typeof schema.maxProperties === 'number' &&
      Object.keys(value).length > schema.maxProperties
    ) {
      issues.push({ path, code: 'MAX_PROPERTIES', message: 'Object has too many properties.' });
    }
    for (const [key, child] of Object.entries(value)) {
      const childSchema = properties[key];
      if (this.isRecord(childSchema))
        this.validateValue(childSchema, child, `${path}.${key}`, issues, depth + 1);
      else if (schema.additionalProperties === false) {
        issues.push({
          path: `${path}.${key}`,
          code: 'ADDITIONAL_PROPERTY',
          message: 'Additional property is not allowed.',
        });
      }
    }
  }

  private validateArray(
    schema: JsonSchema,
    value: unknown[],
    path: string,
    issues: ValidationIssue[],
    depth: number,
  ) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
      issues.push({ path, code: 'MIN_ITEMS', message: 'Array has too few items.' });
    }
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) {
      issues.push({ path, code: 'MAX_ITEMS', message: 'Array has too many items.' });
    }
    if (this.isRecord(schema.items)) {
      value.forEach((child, index) =>
        this.validateValue(
          schema.items as JsonSchema,
          child,
          `${path}[${index}]`,
          issues,
          depth + 1,
        ),
      );
    }
  }

  private validateString(
    schema: JsonSchema,
    value: string,
    path: string,
    issues: ValidationIssue[],
  ) {
    if (typeof schema.minLength === 'number' && value.length < schema.minLength)
      issues.push({ path, code: 'MIN_LENGTH', message: 'String is too short.' });
    if (typeof schema.maxLength === 'number' && value.length > schema.maxLength)
      issues.push({ path, code: 'MAX_LENGTH', message: 'String is too long.' });
    if (typeof schema.pattern === 'string' && !new RegExp(schema.pattern).test(value))
      issues.push({
        path,
        code: 'PATTERN',
        message: 'String does not match the required pattern.',
      });
    if (typeof schema.format === 'string' && !this.matchesFormat(value, schema.format))
      issues.push({ path, code: 'FORMAT', message: `String is not a valid ${schema.format}.` });
  }

  private validateNumber(
    schema: JsonSchema,
    value: number,
    path: string,
    issues: ValidationIssue[],
  ) {
    if (typeof schema.minimum === 'number' && value < schema.minimum)
      issues.push({ path, code: 'MINIMUM', message: 'Number is below the minimum.' });
    if (typeof schema.maximum === 'number' && value > schema.maximum)
      issues.push({ path, code: 'MAXIMUM', message: 'Number is above the maximum.' });
    if (typeof schema.exclusiveMinimum === 'number' && value <= schema.exclusiveMinimum)
      issues.push({
        path,
        code: 'EXCLUSIVE_MINIMUM',
        message: 'Number must be greater than the exclusive minimum.',
      });
    if (typeof schema.exclusiveMaximum === 'number' && value >= schema.exclusiveMaximum)
      issues.push({
        path,
        code: 'EXCLUSIVE_MAXIMUM',
        message: 'Number must be less than the exclusive maximum.',
      });
    if (
      typeof schema.multipleOf === 'number' &&
      Math.abs(value / schema.multipleOf - Math.round(value / schema.multipleOf)) > Number.EPSILON
    )
      issues.push({ path, code: 'MULTIPLE_OF', message: 'Number is not a required multiple.' });
  }

  private compareObjectSchemas(
    accepted: JsonSchema,
    candidate: JsonSchema,
    path: string,
    direction: string,
    issues: ValidationIssue[],
  ): void {
    const acceptedTypes = this.schemaTypes(accepted);
    const candidateTypes = this.schemaTypes(candidate);
    for (const type of acceptedTypes) {
      if (!candidateTypes.includes(type))
        issues.push({
          path,
          code: `${direction}_TYPE_REMOVED`,
          message: `Type '${type}' is no longer accepted.`,
        });
    }
    if (!acceptedTypes.includes('object') || !candidateTypes.includes('object')) return;
    const oldProperties = this.isRecord(accepted.properties) ? accepted.properties : {};
    const newProperties = this.isRecord(candidate.properties) ? candidate.properties : {};
    const oldRequired = new Set(Array.isArray(accepted.required) ? accepted.required : []);
    const newRequired = new Set(Array.isArray(candidate.required) ? candidate.required : []);
    for (const key of newRequired) {
      if (!oldRequired.has(key))
        issues.push({
          path: `${path}.${String(key)}`,
          code: `${direction}_REQUIRED_ADDED`,
          message: 'A new required property is incompatible.',
        });
    }
    for (const [key, oldChild] of Object.entries(oldProperties)) {
      const newChild = newProperties[key];
      if (!newChild) {
        if (candidate.additionalProperties === false)
          issues.push({
            path: `${path}.${key}`,
            code: `${direction}_PROPERTY_REMOVED`,
            message: 'Previously accepted property was removed.',
          });
        continue;
      }
      if (this.isRecord(oldChild) && this.isRecord(newChild))
        this.compareObjectSchemas(oldChild, newChild, `${path}.${key}`, direction, issues);
    }
  }

  private schemaTypes(schema: JsonSchema): string[] {
    if (typeof schema.type === 'string') return [schema.type];
    if (Array.isArray(schema.type) && schema.type.every((type) => typeof type === 'string'))
      return schema.type;
    if (schema.anyOf || schema.oneOf || schema.allOf) return ['object'];
    return [];
  }

  private matchesType(value: unknown, type: string): boolean {
    if (type === 'null') return value === null;
    if (type === 'array') return Array.isArray(value);
    if (type === 'object') return this.isRecord(value);
    if (type === 'integer') return typeof value === 'number' && Number.isInteger(value);
    if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
    if (type === 'string') return typeof value === 'string';
    if (type === 'boolean') return typeof value === 'boolean';
    return false;
  }

  private matchesFormat(value: string, format: string): boolean {
    if (format === 'date')
      return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
    if (format === 'date-time')
      return !Number.isNaN(Date.parse(value)) && /(?:Z|[+-]\d{2}:\d{2})$/.test(value);
    if (format === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    if (format === 'uuid')
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      );
    if (format === 'uri') {
      try {
        new URL(value);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  private equalJson(left: unknown, right: unknown): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }
}
