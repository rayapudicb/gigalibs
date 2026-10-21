import {
  ArchiveSpeedProjectInputV1Schema,
  CreateSpeedProjectInputV1Schema,
  ListSpeedProjectsQueryV1Schema,
  UpdateSpeedProjectInputV1Schema,
} from '@gigalibs/contracts';
import {
  CommandContext,
  CurrentPrincipal,
  type ModuleCommandContext,
  type ModulePrincipal,
  RequirePermissions,
} from '@gigalibs/module-sdk';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthorizationGuard } from '../authorization.js';
import { ProjectsService, errors } from './projects.service.js';

interface ReplayResponse {
  status(code: number): unknown;
  setHeader(name: string, value: string): unknown;
}

/** SPEED projects, `/api/speed/v1/projects` (plan v1.4 §4.4). */
@Controller('v1/projects')
@UseGuards(AuthorizationGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  @RequirePermissions('speed.routes.read')
  list(@CurrentPrincipal() principal: ModulePrincipal, @Query() query: unknown) {
    const { status, siteUnitId, ...page } = errors.parseInput(
      ListSpeedProjectsQueryV1Schema,
      query,
    );
    return this.projects.list(principal, {
      ...page,
      ...(status ? { status } : {}),
      ...(siteUnitId ? { siteUnitId } : {}),
    });
  }

  @Get(':id')
  @RequirePermissions('speed.routes.read')
  get(@CurrentPrincipal() principal: ModulePrincipal, @Param('id') id: string) {
    return this.projects.get(principal, id);
  }

  @Post()
  @RequirePermissions('speed.routes.write')
  async create(
    @CommandContext() context: ModuleCommandContext,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: ReplayResponse,
  ) {
    const { project, replayed } = await this.projects.create(
      context,
      errors.parseInput(CreateSpeedProjectInputV1Schema, body),
    );
    response.status(replayed ? 200 : 201);
    if (replayed) response.setHeader('Idempotency-Replayed', 'true');
    return project;
  }

  @Patch(':id')
  @RequirePermissions('speed.routes.write')
  update(
    @CommandContext() context: ModuleCommandContext,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.projects.update(
      context,
      id,
      errors.parseInput(UpdateSpeedProjectInputV1Schema, body),
    );
  }

  @Post(':id/archive')
  @HttpCode(200)
  @RequirePermissions('speed.routes.write')
  archive(
    @CommandContext() context: ModuleCommandContext,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.projects.archive(
      context,
      id,
      errors.parseInput(ArchiveSpeedProjectInputV1Schema, body),
    );
  }
}
