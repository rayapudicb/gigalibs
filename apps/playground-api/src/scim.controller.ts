import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ScimService,
  ScimUserCreateInput,
  ScimPatchInput,
} from './scim.service.js';
import { Public } from '@gigalibs/auth-nest';

export interface ResponseAdapter {
  setHeader(name: string, value: string | number): void;
  status(code: number): this;
}

@Controller('scim/v2')
export class ScimController {
  constructor(private readonly scimService: ScimService) {}

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
  @Header('Content-Type', 'application/scim+json; charset=utf-8')
  async listUsers(
    @Headers('x-tenant-id') headerTenantId?: string,
    @Query('tenantId') queryTenantId?: string,
    @Query('filter') filter?: string,
    @Query('startIndex') startIndex?: string,
    @Query('count') count?: string,
  ) {
    const tenantId = headerTenantId || queryTenantId || 'default-system-tenant';
    return this.scimService.listUsers({
      tenantId,
      filter,
      startIndex: startIndex ? parseInt(startIndex, 10) : undefined,
      count: count ? parseInt(count, 10) : undefined,
    });
  }

  @Get('Users/:id')
  @Header('Content-Type', 'application/scim+json; charset=utf-8')
  async getUser(
    @Param('id') id: string,
    @Headers('x-tenant-id') headerTenantId?: string,
    @Query('tenantId') queryTenantId?: string,
  ) {
    const tenantId = headerTenantId || queryTenantId || 'default-system-tenant';
    return this.scimService.getUser(id, tenantId);
  }

  @Post('Users')
  @HttpCode(HttpStatus.CREATED)
  @Header('Content-Type', 'application/scim+json; charset=utf-8')
  async createUser(
    @Body() input: ScimUserCreateInput,
    @Headers('x-tenant-id') headerTenantId?: string,
    @Query('tenantId') queryTenantId?: string,
    @Res({ passthrough: true }) res?: ResponseAdapter,
  ) {
    const tenantId = headerTenantId || queryTenantId || 'default-system-tenant';
    const user = await this.scimService.createUser(input, tenantId);
    if (res && res.setHeader) {
      res.setHeader('Location', `/api/v1/scim/v2/Users/${user.id}`);
    }
    return user;
  }

  @Patch('Users/:id')
  @Header('Content-Type', 'application/scim+json; charset=utf-8')
  async patchUser(
    @Param('id') id: string,
    @Body() input: ScimPatchInput,
    @Headers('x-tenant-id') headerTenantId?: string,
    @Query('tenantId') queryTenantId?: string,
  ) {
    const tenantId = headerTenantId || queryTenantId || 'default-system-tenant';
    return this.scimService.patchUser(id, input, tenantId);
  }

  @Delete('Users/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteUser(
    @Param('id') id: string,
    @Headers('x-tenant-id') headerTenantId?: string,
    @Query('tenantId') queryTenantId?: string,
  ) {
    const tenantId = headerTenantId || queryTenantId || 'default-system-tenant';
    await this.scimService.deleteUser(id, tenantId);
  }

  @Get('Groups')
  @Header('Content-Type', 'application/scim+json; charset=utf-8')
  async listGroups(
    @Headers('x-tenant-id') headerTenantId?: string,
    @Query('tenantId') queryTenantId?: string,
  ) {
    const tenantId = headerTenantId || queryTenantId || 'default-system-tenant';
    return this.scimService.listGroups(tenantId);
  }
}
