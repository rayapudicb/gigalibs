import { describe, expect, it } from 'vitest';
import { isFormFieldVisible, type FormFieldDefinition } from '@gigalibs/contracts';

// WI-OI-120ak (S2): the web app's forms engine service (`lib/forms-engine-service.ts`, which nothing imported and which
// queried the database from the web app) was removed with its tests. The contract's visibility rule, used by
// PublicFormRenderer, keeps its tests.
describe('Phase 2: Dual-Mode Form Engine & Mobile APIs', () => {
  describe('Conditional Branching: isFormFieldVisible', () => {
    const dependentField: FormFieldDefinition = {
      id: 'incident_details',
      name: 'incident_details',
      label: 'Incident Remediation Summary',
      type: 'TEXTAREA',
      conditions: [
        {
          dependsOnFieldId: 'has_incidents',
          operator: 'EQUALS',
          value: 'YES',
          action: 'SHOW',
        },
      ],
    };

    it('hides dependent field when condition is not satisfied', () => {
      const visible = isFormFieldVisible(dependentField, { has_incidents: 'NO' });
      expect(visible).toBe(false);
    });

    it('shows dependent field when condition is satisfied', () => {
      const visible = isFormFieldVisible(dependentField, { has_incidents: 'YES' });
      expect(visible).toBe(true);
    });

    it('returns true when field has no conditions', () => {
      const unconditionalField: FormFieldDefinition = {
        id: 'title',
        name: 'title',
        label: 'Title',
        type: 'TEXT',
      };
      expect(isFormFieldVisible(unconditionalField, {})).toBe(true);
    });
  });
});
