import { Module } from '@nestjs/common';
import { RouterModule } from '@nestjs/core';
import { HostHealthController } from './host-health.controller.js';
import { hostedModules } from './hosted-modules.generated.js';
import { hostListenerProvider } from './listener.js';

/**
 * The shared module host (WI-OI-085e; product vision §8, a modular monolith by default). One process runs every
 * generated module whose manifest says `spec.runtime.hosting: host`. Each keeps its own schema, least-privilege
 * database role, signing audience and key, guard and migrations, and is served under /<name>. A module moves to its
 * own service (`hosting: service`) when scale, data isolation, team ownership or failure isolation justifies it.
 */
@Module({
  imports: [
    ...hostedModules.map((hosted) => hosted.module),
    RouterModule.register(hostedModules.map((hosted) => ({ path: hosted.path, module: hosted.module }))),
  ],
  controllers: [HostHealthController],
  providers: [hostListenerProvider],
})
export class HostModule {}
