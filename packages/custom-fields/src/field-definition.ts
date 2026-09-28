import { generateId } from '@gigalibs/crypto';
import type { CustomFieldDefinition } from './types.js';

export class CustomFieldManager {
  private definitions: CustomFieldDefinition[] = [];

  registerField(input: Omit<CustomFieldDefinition, 'id'>): CustomFieldDefinition {
    const field: CustomFieldDefinition = {
      ...input,
      id: generateId(),
    };
    this.definitions.push(field);
    return field;
  }

  getFieldsForEntity(tenantId: string, entityType: string): CustomFieldDefinition[] {
    return this.definitions.filter(
      (d) => d.tenantId === tenantId && d.entityType === entityType,
    );
  }
}
