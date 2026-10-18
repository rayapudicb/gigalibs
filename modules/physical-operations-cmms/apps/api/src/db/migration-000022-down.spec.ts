import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '../../../../db/migrations');
const upSql = readFileSync(join(migrationsDir, '000022_work_order_signed_off_event.up.sql'), 'utf8');
const downSql = readFileSync(join(migrationsDir, '000022_work_order_signed_off_event.down.sql'), 'utf8');

describe('000022_work_order_signed_off_event.up.sql', () => {
  it('allows SIGNED_OFF and records version 22 before COMMIT', () => {
    expect(upSql).toMatch(/'SIGNED_OFF'/);
    expect(upSql).toMatch(/INSERT INTO gigalibs_cmms\.schema_migrations \(version, name\)\s+VALUES \(22,/);
    expect(upSql.indexOf('INSERT INTO gigalibs_cmms.schema_migrations')).toBeLessThan(upSql.indexOf('COMMIT'));
  });
});

describe('000022_work_order_signed_off_event.down.sql', () => {
  it('deletes schema_migrations version 22 before COMMIT', () => {
    expect(downSql).toMatch(/DELETE FROM gigalibs_cmms\.schema_migrations WHERE version = 22;/);
  });
});
