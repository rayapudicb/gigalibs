import { SetMetadata } from '@nestjs/common';

export const ALLOW_MFA_PENDING_KEY = 'allowMfaPending';

export const AllowMfaPending = () => SetMetadata(ALLOW_MFA_PENDING_KEY, true);
