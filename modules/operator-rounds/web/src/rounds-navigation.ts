export type RoundsWorkspaceTab = 'routes' | 'board' | 'exceptions' | 'skips';

export function canUseRoundsPermission(permissions: readonly string[], permission: string): boolean {
  return permissions.includes('*') || permissions.includes('operator-rounds:*') ||
    permissions.includes(permission);
}

export function availableRoundsTabs(permissions: readonly string[]): readonly RoundsWorkspaceTab[] {
  const tabs: RoundsWorkspaceTab[] = [];
  if (canUseRoundsPermission(permissions, 'operator-rounds.routes.read')) tabs.push('routes');
  if (canUseRoundsPermission(permissions, 'operator-rounds.board.read')) tabs.push('board');
  if (canUseRoundsPermission(permissions, 'operator-rounds.exceptions.read')) tabs.push('exceptions');
  if (canUseRoundsPermission(permissions, 'operator-rounds.skips.approve')) tabs.push('skips');
  return tabs;
}
