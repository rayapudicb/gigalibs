import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ModuleRegistryService } from './module-registry.service.js';

@Controller('modules')
export class ModuleRegistryController {
  constructor(private readonly registry: ModuleRegistryService) {}

  @Get()
  listModules() {
    return this.registry.list();
  }

  @Get(':moduleId')
  getModule(@Param('moduleId') moduleId: string) {
    const registeredModule = this.registry.get(moduleId);
    if (!registeredModule) throw new NotFoundException(`Module '${moduleId}' is not registered.`);
    return registeredModule;
  }
}
