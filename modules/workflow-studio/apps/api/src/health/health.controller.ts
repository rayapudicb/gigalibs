import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

@Controller('api/workflow/v1/health')
export class HealthController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  async check(): Promise<any> {
    try {
      const result = await this.db.query(
        `SELECT current_database() AS db, current_schema() AS schema, NOW() AS now,
         (SELECT count(*) FROM gigalibs_workflow.workflow_definitions) AS workflows_count,
         (SELECT count(*) FROM gigalibs_workflow.workflow_runs) AS runs_count`
      );
      return {
        status: 'ok',
        service: 'workflow-studio-api',
        version: '1.0.0',
        port: 4000,
        timestamp: new Date().toISOString(),
        database: {
          connected: true,
          details: result.rows[0],
        },
      };
    } catch (error: unknown) {
      throw new HttpException({
        status: 'unhealthy',
        service: 'workflow-studio-api',
        error: error instanceof Error ? error.message : 'Database check failed',
      }, HttpStatus.SERVICE_UNAVAILABLE);
    }
  }
}
