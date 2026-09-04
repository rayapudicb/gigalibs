import type { CustomFieldDefinition } from './types.js';

export class CustomFieldValidator {
  static validate(def: CustomFieldDefinition, value: unknown): { isValid: boolean; error?: string } {
    if (def.required && (value === undefined || value === null || value === '')) {
      return { isValid: false, error: `${def.label} is required` };
    }

    if (value === undefined || value === null) {
      return { isValid: true };
    }

    switch (def.type) {
      case 'text':
        if (typeof value !== 'string') return { isValid: false, error: `${def.label} must be a text string` };
        break;
      case 'number':
        if (typeof value !== 'number' || Number.isNaN(value)) return { isValid: false, error: `${def.label} must be a valid number` };
        break;
      case 'boolean':
        if (typeof value !== 'boolean') return { isValid: false, error: `${def.label} must be true or false` };
        break;
      case 'select':
        if (def.options && !def.options.includes(String(value))) {
          return { isValid: false, error: `${def.label} must be one of: ${def.options.join(', ')}` };
        }
        break;
      case 'multi_select':
        if (!Array.isArray(value)) return { isValid: false, error: `${def.label} must be an array of values` };
        if (def.options && !value.every((v) => def.options?.includes(String(v)))) {
          return { isValid: false, error: `Invalid option selected for ${def.label}` };
        }
        break;
    }

    return { isValid: true };
  }
}
