import type { UserPreferencesMap } from './types.js';

export const defaultUserPreferences: UserPreferencesMap = {
  locale: 'en',
  timezone: 'UTC',
  dateFormat: 'YYYY-MM-DD',
  theme: 'system',
  notifications: {
    email: true,
    sms: false,
    push: true,
    inApp: true,
  },
};

export function mergePreferences(
  existing?: UserPreferencesMap | null,
  patch?: Partial<UserPreferencesMap>,
): UserPreferencesMap {
  return {
    ...defaultUserPreferences,
    ...(existing ?? {}),
    ...(patch ?? {}),
    notifications: {
      ...defaultUserPreferences.notifications,
      ...(existing?.notifications ?? {}),
      ...(patch?.notifications ?? {}),
    },
  };
}
