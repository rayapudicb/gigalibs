export class PromptComposer {
  /**
   * Compose system prompt with dynamic variables (e.g. {{userName}}, {{company}}).
   */
  static interpolate(template: string, variables: Record<string, string>): string {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replaceAll(`{{${key}}}`, value);
    }
    return result;
  }
}
