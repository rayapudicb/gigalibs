import { BadRequestException } from '@nestjs/common';

const SAFE_SERVICE_IDENTIFIER = /^[A-Za-z0-9._:-]{1,128}$/;

export function requiredServiceIdentifier(
  value: string | undefined,
  headerName: 'x-tenant-id' | 'x-user-id',
): string {
  const normalized = value?.trim();
  if (!normalized || !SAFE_SERVICE_IDENTIFIER.test(normalized)) {
    throw new BadRequestException(`${headerName} must contain a valid service identifier.`);
  }
  return normalized;
}

