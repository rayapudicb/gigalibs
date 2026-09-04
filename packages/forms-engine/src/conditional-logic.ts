import type { FormFieldSchema } from './types.js';

export class FormConditionalLogic {
  /**
   * Determine if a field should be visible based on current form values.
   */
  static isFieldVisible(field: FormFieldSchema, formValues: Record<string, unknown>): boolean {
    if (!field.dependsOn) return true;

    const parentValue = formValues[field.dependsOn.field];
    return parentValue === field.dependsOn.equals;
  }
}
