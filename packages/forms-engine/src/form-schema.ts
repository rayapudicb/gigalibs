import { generateId } from '@gigalibs/crypto';
import type { DynamicFormSchema, FormFieldSchema } from './types.js';

export class DynamicFormBuilder {
  private form: DynamicFormSchema;

  constructor(title: string, description?: string) {
    this.form = {
      id: generateId(),
      title,
      description,
      steps: [
        {
          id: 'step_1',
          title: 'General Details',
          fields: [],
        },
      ],
    };
  }

  addField(field: Omit<FormFieldSchema, 'id'>, stepIndex = 0): this {
    const targetStep = this.form.steps[stepIndex];
    if (targetStep) {
      targetStep.fields.push({
        ...field,
        id: generateId(),
      });
    }
    return this;
  }

  build(): DynamicFormSchema {
    return this.form;
  }
}
