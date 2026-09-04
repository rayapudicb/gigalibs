export interface InviteDetails {
  tenantId: string;
  email: string;
  role: string;
  invitedById: string;
  expiresAt: Date;
}

export interface MembershipInfo {
  userId: string;
  tenantId: string;
  role: string;
  permissions: string[];
}
