export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

export interface TokenPayload {
  sub: string;         // User ID
  tid?: string;        // Tenant ID
  sid: string;         // Session ID
  roles: string[];     // User Roles
  permissions?: string[];
  iat?: number;
  exp?: number;
}

export interface SessionInfo {
  id: string;
  userId: string;
  tenantId?: string;
  userAgent?: string;
  ipAddress?: string;
  expiresAt: Date;
}
