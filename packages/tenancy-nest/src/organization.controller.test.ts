import { readFileSync } from 'node:fs';
import { ORGANIZATION_ROUTES } from '@gigalibs/contracts';
import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@gigalibs/db', () => ({ prisma: {}, Prisma: { JsonNull: null, DbNull: null, AnyNull: null } }));

const { safeError } = await import('./organization.service.js');

// WI-OI-109c: the controller exposes exactly the documented routes, each with its documented permission and status.
describe('organization controller', () => {
  it('matches the route table method, path, permission and status', () => {
    const source = readFileSync(new URL('./organization.controller.ts', import.meta.url), 'utf8');
    const routes = [...source.matchAll(/@(Get|Post|Patch)\('([^']+)'\)\s*(?:@HttpCode\((\d+)\)\s*)?@RequirePermissions\('([^']+)'\)/g)].map((match) => {
      const method = (match[1] as string).toLowerCase();
      return {
        method,
        path: `/${(match[2] as string).replaceAll(/:([A-Za-z]+)/g, '{$1}')}`,
        permission: match[4],
        status: match[3] ? Number(match[3]) : method === 'post' ? 201 : 200,
      };
    });
    const decorated = (source.match(/@(Get|Post|Patch|Put|Delete)\(/g) ?? []).length;
    expect(routes).toHaveLength(decorated);
    const documented = ORGANIZATION_ROUTES.map(({ method, path, permission, status }) => ({ method, path, permission, status }));
    const key = (route: { method: string; path: string }) => `${route.method} ${route.path}`;
    expect([...routes].sort((a, b) => key(a).localeCompare(key(b)))).toEqual([...documented].sort((a, b) => key(a).localeCompare(key(b))));
  });

  it.each([
    [{ code: 'P2002', meta: {} }, ConflictException],
    [{ code: 'P2010', meta: { code: '23503' } }, UnprocessableEntityException],
    [{ message: 'ConnectorError(... PostgresError { code: "23514", message: "violates check constraint" }' }, UnprocessableEntityException],
    [{ message: 'ConnectorError(... PostgresError { code: "55000", message: "version is published" }' }, ConflictException],
  ])('turns database refusals into safe client errors: %j', (error, expected) => {
    const mapped = safeError(error);
    expect(mapped).toBeInstanceOf(expected);
    expect((mapped as Error).message).not.toMatch(/constraint|published|PostgresError/);
  });

  it('leaves unexpected failures as server errors', () => {
    const failure = new Error('connection reset');
    expect(safeError(failure)).toBe(failure);
  });
});
