import { Controller, Get, Inject, Post, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

@Controller('health')
export class HealthController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  @Get('live')
  liveness(): { status: 'alive' } {
    return { status: 'alive' };
  }

  @Post('live')
  livePost(): { status: 'alive' } {
    return { status: 'alive' };
  }

  @Get('ready')
  async readiness(): Promise<{ status: 'ready' }> {
    try {
      if (await this.database.isReady()) return { status: 'ready' };
    } catch {
      // The response is deliberately redacted; the detailed failure belongs in server telemetry.
    }
    throw new ServiceUnavailableException({
      type: 'https://problems.gigalibs.io/ar/dependency-unavailable',
      title: 'A required dependency is unavailable',
      status: 503,
    });
  }
}
