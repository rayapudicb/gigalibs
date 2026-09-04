export class MembershipService {
  /**
   * Determine if a user is allowed to transfer tenant ownership.
   */
  static canTransferOwnership(currentRole: string): boolean {
    return currentRole === 'SUPER_ADMIN' || currentRole === 'TENANT_ADMIN';
  }

  /**
   * Determine if a role can manage other members of targetRole.
   */
  static canManageRole(operatorRole: string, targetRole: string): boolean {
    const weights: Record<string, number> = {
      SUPER_ADMIN: 100,
      TENANT_ADMIN: 80,
      MANAGER: 50,
      MEMBER: 20,
      VIEWER: 10,
      GUEST: 5,
    };

    const opWeight = weights[operatorRole] ?? 0;
    const targetWeight = weights[targetRole] ?? 0;

    return opWeight > targetWeight;
  }
}
