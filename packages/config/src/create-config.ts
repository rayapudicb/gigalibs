import { z } from 'zod';

/**
 * Create a typed, validated config object from environment variables.
 *
 * @example
 * const config = createConfig(z.object({
 *   DATABASE_URL: z.string().url(),
 *   JWT_SECRET: z.string().min(32),
 *   PORT: z.coerce.number().default(3000),
 * }));
 *
 * config.DATABASE_URL // ← fully typed string
 */
export function createConfig<T extends z.ZodRawShape>(
  schema: z.ZodObject<T>,
  env: NodeJS.ProcessEnv = process.env,
): z.infer<z.ZodObject<T>> {
  const result = schema.safeParse(env);

  if (!result.success) {
    const missing = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`❌ Invalid environment variables:\n${missing}`);
  }

  return result.data;
}

/**
 * Type helper to extract the config type from a Zod schema.
 *
 * @example
 * const myConfigSchema = z.object({ PORT: z.coerce.number() });
 * type MyConfig = InferConfig<typeof myConfigSchema>;
 */
export type InferConfig<T extends z.ZodObject<z.ZodRawShape>> = z.infer<T>;
