import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

@Controller('api/data-studio/v1/health')
export class HealthController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  async check(): Promise<any> {
    try {
      const result = await this.db.query(
        `SELECT current_database() AS db, current_schema() AS schema, NOW() AS now,
         (SELECT count(*) FROM gigalibs_data_studio.data_contracts) AS contracts_count`
      );
      return {
        status: 'ok',
        service: 'universal-data-studio-api',
        version: '1.0.0',
        port: 3800,
        timestamp: new Date().toISOString(),
        database: {
          connected: true,
          details: result.rows[0],
        },
      };
    } catch (error: unknown) {
      throw new HttpException({
        status: 'unhealthy',
        service: 'universal-data-studio-api',
        error: error instanceof Error ? error.message : 'Database check failed',
      }, HttpStatus.SERVICE_UNAVAILABLE);
    }
  }
}
