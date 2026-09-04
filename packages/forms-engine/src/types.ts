export interface FormFieldSchema {
  id: string;
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'email' | 'phone' | 'select' | 'checkbox' | 'radio' | 'date' | 'file';
  placeholder?: string;
  required?: boolean;
  options?: Array<{ label: string; value: string }>;
  dependsOn?: {
    field: string;
    equals: unknown;
  };
}

export interface FormStepSchema {
  id: string;
  title: string;
  description?: string;
  fields: FormFieldSchema[];
}

export interface DynamicFormSchema {
  id: string;
  title: string;
  description?: string;
  steps: FormStepSchema[];
}
