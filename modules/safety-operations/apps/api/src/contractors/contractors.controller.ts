import {
  CommandContext,
  CurrentPrincipal,
  type ModuleCommandContext,
  type ModulePrincipal,
  RequirePermissions,
} from '@gigalibs/module-sdk';
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { AuthorizationGuard } from '../authorization.js';
import { ContractorsService } from './contractors.service.js';

/** WI-OI-143 M-CONTR: contractor companies, induction passes, gate verify, escort and on-site roster. */
@Controller('v1')
@UseGuards(AuthorizationGuard)
export class ContractorsController {
  constructor(private readonly contractors: ContractorsService) {}

  @Post('contractor-companies')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('safety-operations.contractors.admin')
  createCompany(@CommandContext() context: ModuleCommandContext, @Body() body: unknown) {
    return this.contractors.createCompany(context, body);
  }

  @Get('contractor-companies')
  @RequirePermissions('safety-operations.contractors.admin')
  listCompanies(@CurrentPrincipal() principal: ModulePrincipal) {
    return this.contractors.listCompanies(principal);
  }

  @Post('contractor-companies/:companyId')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('safety-operations.contractors.admin')
  updateCompany(
    @CommandContext() context: ModuleCommandContext,
    @Param('companyId') companyId: string,
    @Body() body: unknown,
  ) {
    return this.contractors.updateCompany(context, companyId, body);
  }

  @Post('contractor-companies/:companyId/workers')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('safety-operations.contractors.admin')
  createWorker(
    @CommandContext() context: ModuleCommandContext,
    @Param('companyId') companyId: string,
    @Body() body: unknown,
  ) {
    return this.contractors.createWorker(context, companyId, body);
  }

  @Post('contractor-workers/enroll')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('safety-operations.contractors.worker')
  enroll(@CommandContext() context: ModuleCommandContext, @Body() body: unknown) {
    return this.contractors.enroll(context, body);
  }

  @Get('contractor-workers/mine')
  @RequirePermissions('safety-operations.contractors.worker')
  workerMine(@CurrentPrincipal() principal: ModulePrincipal) {
    return this.contractors.workerMine(principal);
  }

  @Post('contractor-inductions')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('safety-operations.contractors.worker')
  completeInduction(@CommandContext() context: ModuleCommandContext, @Body() body: unknown) {
    return this.contractors.completeInduction(context, body);
  }

  @Get('contractor-passes/mine')
  @RequirePermissions('safety-operations.contractors.worker')
  myPass(@CurrentPrincipal() principal: ModulePrincipal) {
    return this.contractors.myPass(principal);
  }

  @Post('contractor-passes/verify')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('safety-operations.contractors.gate')
  verify(@CommandContext() context: ModuleCommandContext, @Body() body: unknown) {
    return this.contractors.verifyPass(context, body);
  }

  @Get('contractor-roster')
  @RequirePermissions('safety-operations.contractors.roster')
  roster(@CurrentPrincipal() principal: ModulePrincipal) {
    return this.contractors.roster(principal);
  }

  @Post('contractor-visits/:visitId/checkout')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('safety-operations.contractors.roster')
  checkout(
    @CommandContext() context: ModuleCommandContext,
    @Param('visitId') visitId: string,
    @Body() body: unknown,
  ) {
    return this.contractors.checkout(context, visitId, body);
  }

  @Post('contractor-visits/:visitId/escort')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('safety-operations.contractors.escort')
  escort(
    @CommandContext() context: ModuleCommandContext,
    @Param('visitId') visitId: string,
    @Body() body: unknown,
  ) {
    return this.contractors.escort(context, visitId, body);
  }
}
