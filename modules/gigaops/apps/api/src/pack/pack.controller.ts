import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { CurrentWorkforcePrincipal, GigaOpsAuthorizationGuard, RequirePermissions, type GigaOpsPrincipal } from '../auth/authorization.js';
import { commandContext } from '../common/commands.js';
import { WorkforcePackService } from './pack.service.js';

/** WI-OI-107: Workforce's section of the active packs. `apply` is called by the kernel's `pack.apply` job. */
@Controller('v1/pack')
@UseGuards(GigaOpsAuthorizationGuard)
export class WorkforcePackController {
  constructor(private readonly packs: WorkforcePackService) {}

  @Get()
  @RequirePermissions('workforce:read')
  current(@CurrentWorkforcePrincipal() principal: GigaOpsPrincipal) {
    return this.packs.current(principal);
  }

  @Post('apply')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('workforce.configuration.manage')
  apply(
    @CurrentWorkforcePrincipal() principal: GigaOpsPrincipal,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Body() body: unknown,
  ) {
    return this.packs.apply(commandContext(principal, correlationId), body);
  }
}
