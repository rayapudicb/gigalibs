import { Injectable, OnModuleInit } from '@nestjs/common';
import { ModuleRegistry, type ModuleManifest } from '@gigalibs/module-registry';

@Injectable()
export class ModuleRegistryService extends ModuleRegistry implements OnModuleInit {
  constructor(manifests: ModuleManifest[]) {
    super(manifests);
  }

  onModuleInit(): void {
    this.assertReady();
  }
}
