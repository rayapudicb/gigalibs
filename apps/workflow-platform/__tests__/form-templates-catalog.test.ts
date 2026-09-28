import { describe, expect, it } from 'vitest';
import { ConfigurationDefinitionSchema } from '@gigalibs/contracts';
import {
  FORM_TEMPLATES_CATALOG,
  FORM_TEMPLATE_CATEGORIES,
  getFormTemplateById,
  getFormTemplatesByCategory,
} from '../lib/form-templates-catalog';

describe('Form Templates Catalog', () => {
  it('contains exactly 24 categorized templates covering all required business domains', () => {
    expect(FORM_TEMPLATES_CATALOG.length).toBe(24);
    expect(FORM_TEMPLATE_CATEGORIES.length).toBe(24);

    const categoriesInCatalog = new Set(FORM_TEMPLATES_CATALOG.map((t) => t.category));
    for (const category of FORM_TEMPLATE_CATEGORIES) {
      expect(categoriesInCatalog.has(category)).toBe(true);
    }
  });

  it('validates every template strictly against ConfigurationDefinitionSchema with 0 errors', () => {
    for (const template of FORM_TEMPLATES_CATALOG) {
      const parsed = ConfigurationDefinitionSchema.safeParse(template.definition);
      if (!parsed.success) {
        console.error(`Validation failed for template: ${template.id}`, parsed.error.format());
      }
      expect(parsed.success).toBe(true);
    }
  });

  it('ensures every section references only existing fields within that template', () => {
    for (const template of FORM_TEMPLATES_CATALOG) {
      const fieldKeySet = new Set(template.definition.fields.map((f) => f.key));
      for (const section of template.definition.sections) {
        for (const key of section.fieldKeys) {
          expect(fieldKeySet.has(key)).toBe(true);
        }
      }
    }
  });

  it('supports retrieval by ID and by category', () => {
    const leadGen = getFormTemplateById('lead-generation-b2b');
    expect(leadGen).toBeDefined();
    expect(leadGen?.category).toBe('Lead Generation');

    const surveyTemplates = getFormTemplatesByCategory('Survey');
    expect(surveyTemplates.length).toBeGreaterThan(0);
    expect(surveyTemplates[0].category).toBe('Survey');

    const missing = getFormTemplateById('non-existent-id');
    expect(missing).toBeUndefined();
  });
});
