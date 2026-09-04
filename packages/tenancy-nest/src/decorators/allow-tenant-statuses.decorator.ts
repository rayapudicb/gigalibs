import { SetMetadata } from '@nestjs/common';
import type { TenantStatus } from '@gigalibs/db';

export const AllowTenantStatuses = (...statuses: TenantStatus[]) =>
  SetMetadata('allowedTenantStatuses', statuses);
