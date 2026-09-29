import type { ModuleListenerConfig } from '@gigalibs/module-sdk';
import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { hostedModules } from './hosted-modules.generated.js';
import { HOST_LISTENER } from './listener.js';
import { hostReadiness } from './readiness.js';

@Controller('health')
export class HostHealthController {
  constructor(@Inject(HOST_LISTENER) private readonly listener: ModuleListenerConfig) {}

  /** Liveness: the process answers; it never touches dependencies. */
  @Get('live')
  live() {
    return {
      status: 'ok',
      service: 'gigalibs-module-host',
      modules: hostedModules.map((hosted) => hosted.name),
      timestamp: new Date().toISOString(),
    };
  }

  /** Readiness: every hosted module is ready at its schema contract. */
  @Get(['', 'ready'])
  async ready() {
    const state = await hostReadiness(hostedModules, this.listener.apiPort);
    if (!state.ready) throw new ServiceUnavailableException({ status: 'not-ready', modules: state.modules });
    return { status: 'ok', service: 'gigalibs-module-host', modules: state.modules, timestamp: new Date().toISOString() };
  }
}
