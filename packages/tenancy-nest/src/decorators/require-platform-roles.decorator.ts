import { SetMetadata } from '@nestjs/common';
import type { PlatformRole } from '@gigalibs/contracts';

export const PLATFORM_ROLES_KEY = 'requiredPlatformRoles';

export const RequirePlatformRoles = (...roles: PlatformRole[]) =>
  SetMetadata(PLATFORM_ROLES_KEY, roles);
