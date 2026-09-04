import { Public } from '@gigalibs/auth-nest';
import { prisma } from '@gigalibs/db';
import {
  Controller,
  Get,
  Header,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
// biome-ignore lint/style/useImportType: NestJS needs the runtime constructor token for dependency injection.
import { MetricsService } from './metrics.service.js';
// biome-ignore lint/style/useImportType: NestJS needs the runtime constructor token for dependency injection.
import { MetricsTokenGuard } from './metrics-token.guard.js';

@Controller()
export class PlatformController {
  constructor(private readonly metrics: MetricsService) {}

  @Public()
  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'gigalibs-api',
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Get('ready')
  async ready() {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'ready', database: 'connected' };
    } catch {
      throw new ServiceUnavailableException({
        status: 'not-ready',
        database: 'unavailable',
      });
    }
  }

  @Public()
  @UseGuards(MetricsTokenGuard)
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @Get('internal/metrics')
  metricsSnapshot() {
    return this.metrics.renderPrometheus();
  }
}
