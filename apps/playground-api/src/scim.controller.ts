import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  ForbiddenException,
  Inject,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ScimService } from './scim.service.js';
import { CurrentUser, Public } from '@gigalibs/auth-nest';
import { CurrentTenant } from '@gigalibs/tenancy-nest';
import { RequirePermissions } from '@gigalibs/rbac-nest';
import { parseScim, scimPageNumber, ScimPatchSchema, ScimUserCreateSchema } from './scim.validation.js';

export interface ResponseAdapter {
  setHeader(name: string, value: string | number): void;
  status(code: number): this;
}

@Controller('scim/v2')
export class ScimController {
  constructor(@Inject(ScimService) private readonly scimService: ScimService) {}

  @Public()
  @Get('ServiceProviderConfig')
  @Header('Content-Type', 'application/scim+json; charset=utf-8')
  getServiceProviderConfig() {
    return this.scimService.getServiceProviderConfig();
  }

  @Public()
  @Get('ResourceTypes')
  @Header('Content-Type', 'application/scim+json; charset=utf-8')
  getResourceTypes() {
    return this.scimService.getResourceTypes();
  }

  @Public()
  @Get('Schemas')
  @Header('Content-Type', 'application/scim+json; charset=utf-8')
  getSchemas() {
    return this.scimService.getSchemas();
  }

  @Get('Users')
  @RequirePermissions('users:read')
  @Header('Content-Type', 'application/scim+json; charset=utf-8')
  async listUsers(
    @CurrentTenant('tenantId') tenantId: string,
    @Query('filter') filter?: string,
    @Query('startIndex') startIndex?: string,
    @Query('count') count?: string,
  ) {
    this.requireTenant(tenantId);
    return this.scimService.listUsers({
      tenantId,
      filter,
      startIndex: scimPageNumber(startIndex, 1, 1_000_000),
      count: scimPageNumber(count, 20, 100),
    });
  }

  @Get('Users/:id')
  @RequirePermissions('users:read')
  @Header('Content-Type', 'application/scim+json; charset=utf-8')
  async getUser(
    @Param('id') id: string,
    @CurrentTenant('tenantId') tenantId: string,
  ) {
    this.requireTenant(tenantId);
    return this.scimService.getUser(id, tenantId);
  }

  @Post('Users')
  @RequirePermissions('users:create')
  @HttpCode(HttpStatus.CREATED)
  @Header('Content-Type', 'application/scim+json; charset=utf-8')
  async createUser(
    @Body() input: unknown,
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Res({ passthrough: true }) res?: ResponseAdapter,
  ) {
    this.requireTenant(tenantId);
    const user = await this.scimService.createUser(parseScim(ScimUserCreateSchema, input), tenantId, actorId);
    if (res && res.setHeader) {
      res.setHeader('Location', `/api/v1/scim/v2/Users/${user.id}`);
    }
    return user;
  }

  @Patch('Users/:id')
  @RequirePermissions('users:update')
  @Header('Content-Type', 'application/scim+json; charset=utf-8')
  async patchUser(
    @Param('id') id: string,
    @Body() input: unknown,
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
  ) {
    this.requireTenant(tenantId);
    return this.scimService.patchUser(id, parseScim(ScimPatchSchema, input), tenantId, actorId);
  }

  @Delete('Users/:id')
  @RequirePermissions('users:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteUser(
    @Param('id') id: string,
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
  ) {
    this.requireTenant(tenantId);
    await this.scimService.deleteUser(id, tenantId, actorId);
  }

  @Get('Groups')
  @RequirePermissions('users:read')
  @Header('Content-Type', 'application/scim+json; charset=utf-8')
  async listGroups(
    @CurrentTenant('tenantId') tenantId: string,
  ) {
    this.requireTenant(tenantId);
    return this.scimService.listGroups(tenantId);
  }

  private requireTenant(tenantId: string) {
    if (!tenantId) throw new ForbiddenException('Select an authorized tenant before accessing SCIM.');
  }
}
