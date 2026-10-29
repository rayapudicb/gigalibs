/**
 * Opt-in: IOT_PG_TEST_URL=postgresql://.../gigalibs_iot_test pnpm vitest run modules/iot-gateway/apps/api/src/iot.pg.integration.test.ts
 */
import { describe, expect, it } from 'vitest';
import pg from 'pg';

const url = process.env.IOT_PG_TEST_URL;

describe.skipIf(!url)('IoT PostgreSQL migrations (WI-OI-130)', () => {
  it('applies runtime manifest through v4', async () => {
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    try {
      const manifest = await import('node:fs/promises').then((fs) =>
        fs.readFile(new URL('../../db/runtime-manifest.txt', import.meta.url), 'utf8'),
      );
      const files = manifest
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'));
      for (const file of files) {
        const sql = await import('node:fs/promises').then((fs) =>
          fs.readFile(new URL(`../../db/migrations/${file}`, import.meta.url), 'utf8'),
        );
        await client.query(sql);
      }
      const version = await client.query<{ max: number }>(
        'SELECT MAX(version)::int AS max FROM gigalibs_iot.schema_migrations',
      );
      expect(version.rows[0]?.max).toBeGreaterThanOrEqual(4);
    } finally {
      await client.query('DROP SCHEMA IF EXISTS gigalibs_iot CASCADE');
      await client.end();
    }
  });
});
