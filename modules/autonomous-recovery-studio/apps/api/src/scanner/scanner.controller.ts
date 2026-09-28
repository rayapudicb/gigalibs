import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ScannerService } from './scanner.service.js';
import {
  OidcAuthorizationGuard,
  Principal,
  type RecoveryPrincipal,
  RequirePermissions,
} from '../auth/authorization.js';

@Controller('v1/scans')
@UseGuards(OidcAuthorizationGuard)
export class ScannerController {
  constructor(private readonly scannerService: ScannerService) {}

  @Get()
  @RequirePermissions('recovery:read')
  async getScans(@Principal() principal: RecoveryPrincipal) {
    return this.scannerService.getScans(principal.tenantId);
  }

  @Post()
  @RequirePermissions('recovery:action')
  async triggerScan(
    @Principal() principal: RecoveryPrincipal,
    @Body() body?: { scanName?: string },
  ) {
    return this.scannerService.triggerScan(principal.tenantId, body?.scanName, principal);
  }
}
