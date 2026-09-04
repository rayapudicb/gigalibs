export interface SanitizedUser {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  avatarUrl?: string | null;
  status: string;
  createdAt: Date;
}

export interface UserPreferencesMap {
  locale?: string;
  timezone?: string;
  dateFormat?: string;
  theme?: 'light' | 'dark' | 'system';
  notifications?: {
    email?: boolean;
    sms?: boolean;
    push?: boolean;
    inApp?: boolean;
  };
}
