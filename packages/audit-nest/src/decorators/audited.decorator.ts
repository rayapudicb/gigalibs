import { SetMetadata } from '@nestjs/common';

export const AUDITED_KEY = 'audited';

export interface AuditMetadata {
  action: string;
  resource: string;
}

export const Audited = (action: string, resource: string) =>
  SetMetadata(AUDITED_KEY, { action, resource } as AuditMetadata);
