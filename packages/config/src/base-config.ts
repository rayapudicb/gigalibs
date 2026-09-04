import { z } from 'zod';
import { createConfig } from './create-config.js';

/**
 * Base platform config schema.
 * All gigalibs NestJS apps extend this with their own module-specific vars.
 *
 * @example
 * // In your NestJS app:
 * import { BaseConfigSchema } from '@gigalibs/config';
 *
 * const AppConfigSchema = BaseConfigSchema.extend({
 *   STRIPE_SECRET_KEY: z.string(),
 *   TWILIO_ACCOUNT_SID: z.string(),
 * });
 *
 * export const config = createConfig(AppConfigSchema);
 */
export const BaseConfigSchema = z.object({
  // Runtime
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: z.coerce.number().int().min(1).max(65_535),
  APP_URL: z.string().url(),
  CORS_ORIGINS: z.string().min(1, 'CORS_ORIGINS is required'),

  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Redis
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  // JWT
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 chars'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 chars'),
  JWT_ACCESS_EXPIRES_IN: z.string().min(1, 'JWT_ACCESS_EXPIRES_IN is required'),
  JWT_REFRESH_EXPIRES_IN: z.string().min(1, 'JWT_REFRESH_EXPIRES_IN is required'),

  // Crypto
  ENCRYPTION_KEY: z.string().min(32).optional(),

  // Storage
  STORAGE_ENDPOINT: z.string().url().optional(),
  STORAGE_ACCESS_KEY: z.string().optional(),
  STORAGE_SECRET_KEY: z.string().optional(),
  STORAGE_BUCKET: z.string().optional(),
  STORAGE_REGION: z.string().min(1, 'STORAGE_REGION is required'),
});

export type BaseConfig = z.infer<typeof BaseConfigSchema>;

// Convenience: load and validate the base config immediately
// (lazy — only called when imported, not at module evaluation)
export const loadBaseConfig = () => createConfig(BaseConfigSchema);
