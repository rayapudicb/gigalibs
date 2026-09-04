/**
 * Typed Redis key builders.
 * Centralize all key names to prevent typos and namespace collisions.
 *
 * Pattern: gigalibs:{module}:{tenantId?}:{entity}:{id?}
 */
export const Keys = {
  // Auth / Sessions
  session: (sessionId: string) => `gigalibs:session:${sessionId}`,
  userSessions: (userId: string) => `gigalibs:user:${userId}:sessions`,
  blacklistedToken: (jti: string) => `gigalibs:token:blacklist:${jti}`,

  // OTP rate limiting
  otpAttempts: (target: string, purpose: string) =>
    `gigalibs:otp:attempts:${purpose}:${target}`,
  otpCooldown: (target: string) => `gigalibs:otp:cooldown:${target}`,

  // Tenant cache
  tenant: (tenantId: string) => `gigalibs:tenant:${tenantId}`,
  tenantBySlug: (slug: string) => `gigalibs:tenant:slug:${slug}`,
  tenantFeatures: (tenantId: string) => `gigalibs:tenant:${tenantId}:features`,

  // User cache
  user: (userId: string) => `gigalibs:user:${userId}`,
  userPermissions: (userId: string, tenantId: string) =>
    `gigalibs:user:${userId}:tenant:${tenantId}:perms`,

  // Presence
  presence: (userId: string) => `gigalibs:presence:${userId}`,
  onlineUsers: (tenantId: string) => `gigalibs:online:${tenantId}`,
  typing: (channelId: string) => `gigalibs:typing:${channelId}`,

  // Rate limiting
  rateLimit: (key: string) => `gigalibs:ratelimit:${key}`,

  // Feature flags
  featureFlags: (tenantId: string) => `gigalibs:flags:${tenantId}`,

  // Cache (generic)
  cache: (namespace: string, key: string) => `gigalibs:cache:${namespace}:${key}`,

  // Distributed lock
  lock: (resource: string) => `gigalibs:lock:${resource}`,
} as const;

export type KeyBuilder = typeof Keys;
