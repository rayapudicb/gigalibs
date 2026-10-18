/** WI-OI-120bi: rollback must drop ledger row 21 so images pinned at 20 can start again. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '../../../../db/migrations');
const downSql = readFileSync(join(migrationsDir, '000021_work_order_sign_off.down.sql'), 'utf8');

describe('000021_work_order_sign_off.down.sql', () => {
  it('deletes schema_migrations version 21 before COMMIT', () => {
    expect(downSql).toMatch(/DELETE FROM gigalibs_cmms\.schema_migrations WHERE version = 21;/);
    expect(downSql.indexOf('DELETE FROM')).toBeLessThan(downSql.indexOf('COMMIT'));
  });
});
