import type { SanitizedUser } from './types.js';

export class UserProfileService {
  /**
   * Strip sensitive fields from raw database user record.
   */
  static sanitize<T extends { passwordHash?: string | null; preferences?: unknown; metadata?: unknown }>(
    user: T & { id: string; email: string; name: string; status: string; createdAt: Date; phone?: string | null; avatarUrl?: string | null },
  ): SanitizedUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      ...(user.phone !== undefined ? { phone: user.phone } : {}),
      ...(user.avatarUrl !== undefined ? { avatarUrl: user.avatarUrl } : {}),
      status: user.status,
      createdAt: user.createdAt,
    };
  }
}
