import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service.js';

type TenantScope = {
  id: string;
  slug: string;
  schema: string;
  tenant: Record<string, any>;
};

type UsageInput = {
  eventId: string;
  userId: string;
  capabilityCode: string;
  moduleName: string;
  units: number;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class RbacService {
  constructor(private readonly db: DatabaseService) {}

  async getTenantContext(tenantKey: string, userId: string) {
    const scope = await this.resolveTenant(tenantKey);
    const userRes = await this.db.query(
      `SELECT u.id, u.email, u.name, u.status, u.spending_limit_usd,
              u.allowed_cost_centers, d.name AS department_name,
              g.name AS group_name, r.id AS role_id, r.name AS role_name,
              r.code AS role_code
       FROM ${scope.schema}.user_memberships u
       LEFT JOIN ${scope.schema}.departments d ON u.department_id = d.id
       LEFT JOIN ${scope.schema}.groups g ON u.group_id = g.id
       JOIN ${scope.schema}.roles r ON u.role_id = r.id
       WHERE u.id = $1 AND u.status = 'ACTIVE'`,
      [userId],
    );
    const user = userRes.rows[0];
    if (!user) {
      throw new NotFoundException('Active tenant membership was not found for the authenticated user.');
    }

    const [seatCountRes, permissionRes, overrideRes] = await Promise.all([
      this.db.query(
        `SELECT COUNT(*)::int AS count
         FROM ${scope.schema}.user_memberships
         WHERE status = 'ACTIVE'`,
      ),
      this.db.query(
        `SELECT p.code
         FROM ${scope.schema}.role_permissions rp
         JOIN ${scope.schema}.permissions p ON p.id = rp.permission_id
         WHERE rp.role_id = $1`,
        [user.role_id],
      ),
      this.db.query(
        `SELECT permission_code, effect, expires_at
         FROM ${scope.schema}.user_permissions
         WHERE user_id = $1 AND (expires_at IS NULL OR expires_at > NOW())`,
        [user.id],
      ),
    ]);

    const permissions = new Set(permissionRes.rows.map((row: any) => String(row.code)));
    for (const override of overrideRes.rows) {
      if (override.effect === 'DENY') permissions.delete(override.permission_code);
      if (override.effect === 'GRANT') permissions.add(override.permission_code);
    }

    const maxSeats = this.readSeatLimit(scope.tenant.max_user_seats);
    const seatsUsed = Number(seatCountRes.rows[0]?.count ?? 0);
    const seatsAvailable = Math.max(0, maxSeats - seatsUsed);
    const utilizationPct = Math.min(100, Math.round((seatsUsed / maxSeats) * 100));

    return {
      tenant: {
        ...scope.tenant,
        max_user_seats: maxSeats,
        seats_used: seatsUsed,
        seats_available: seatsAvailable,
        seat_utilization_pct: utilizationPct,
      },
      seats: {
        totalLimit: maxSeats,
        used: seatsUsed,
        available: seatsAvailable,
        utilizationPct,
      },
      currentUser: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role_code,
        department: user.department_name,
        group: user.group_name,
        spendingLimitUsd: Number(user.spending_limit_usd),
        allowedCostCenters: user.allowed_cost_centers ?? [],
        permissions: [...permissions].sort(),
        userOverrides: overrideRes.rows,
      },
    };
  }

  async getDepartments(tenantKey: string) {
    const scope = await this.resolveTenant(tenantKey);
    const res = await this.db.query(`
      SELECT id, name, code, parent_id, manager_name, spending_limit_usd, created_at
      FROM ${scope.schema}.departments
      ORDER BY created_at ASC
    `);
    return res.rows;
  }

  async createDepartment(
    tenantKey: string,
    data: { name: string; code: string; managerName?: string; spendingLimitUsd?: number },
  ) {
    const scope = await this.resolveTenant(tenantKey);
    const id = `DEP-${randomUUID().slice(0, 6).toUpperCase()}`;
    const spendingLimit = data.spendingLimitUsd ?? 50_000;
    this.assertNonNegativeNumber(spendingLimit, 'spendingLimitUsd');
    const res = await this.db.query(
      `INSERT INTO ${scope.schema}.departments
         (id, name, code, manager_name, spending_limit_usd, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING *`,
      [id, data.name, data.code.toUpperCase(), data.managerName ?? null, spendingLimit],
    );
    return res.rows[0];
  }

  async getGroups(tenantKey: string) {
    const scope = await this.resolveTenant(tenantKey);
    const res = await this.db.query(`
      SELECT g.id, g.department_id, g.name, g.description,
             d.name AS department_name, g.created_at
      FROM ${scope.schema}.groups g
      LEFT JOIN ${scope.schema}.departments d ON g.department_id = d.id
      ORDER BY g.created_at ASC
    `);
    return res.rows;
  }

  async createGroup(
    tenantKey: string,
    data: { departmentId: string; name: string; description?: string },
  ) {
    const scope = await this.resolveTenant(tenantKey);
    const id = `GRP-${randomUUID().slice(0, 6).toUpperCase()}`;
    const res = await this.db.query(
      `INSERT INTO ${scope.schema}.groups
         (id, department_id, name, description, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING *`,
      [id, data.departmentId, data.name, data.description ?? ''],
    );
    return res.rows[0];
  }

  async getRoles(tenantKey: string) {
    const scope = await this.resolveTenant(tenantKey);
    const res = await this.db.query(`
      SELECT r.id, r.name, r.code, r.description, r.is_system,
             COALESCE(array_agg(p.code) FILTER (WHERE p.code IS NOT NULL), '{}') AS permissions
      FROM ${scope.schema}.roles r
      LEFT JOIN ${scope.schema}.role_permissions rp ON r.id = rp.role_id
      LEFT JOIN ${scope.schema}.permissions p ON rp.permission_id = p.id
      GROUP BY r.id, r.name, r.code, r.description, r.is_system, r.created_at
      ORDER BY r.is_system DESC, r.created_at ASC
    `);
    return res.rows;
  }

  async createRole(
    tenantKey: string,
    data: { name: string; code: string; description?: string; permissionCodes: string[] },
  ) {
    const scope = await this.resolveTenant(tenantKey);
    const id = `ROL-${randomUUID().slice(0, 6).toUpperCase()}`;
    const code = data.code.toUpperCase();
    const permissionCodes = [...new Set(data.permissionCodes)];
    const client = await this.db.getClient();
    try {
      await client.query('BEGIN');
      const permissionRes = permissionCodes.length
        ? await client.query(
            `SELECT id, code FROM ${scope.schema}.permissions WHERE code = ANY($1::text[])`,
            [permissionCodes],
          )
        : { rows: [] };
      if (permissionRes.rows.length !== permissionCodes.length) {
        const found = new Set(permissionRes.rows.map((row: any) => row.code));
        const unknown = permissionCodes.filter((permission) => !found.has(permission));
        throw new BadRequestException(`Unknown permission code(s): ${unknown.join(', ')}`);
      }

      await client.query(
        `INSERT INTO ${scope.schema}.roles
           (id, name, code, description, is_system, created_at)
         VALUES ($1, $2, $3, $4, FALSE, NOW())`,
        [id, data.name, code, data.description ?? ''],
      );
      for (const permission of permissionRes.rows) {
        await client.query(
          `INSERT INTO ${scope.schema}.role_permissions (role_id, permission_id)
           VALUES ($1, $2)`,
          [id, permission.id],
        );
      }
      await client.query('COMMIT');
      return { id, name: data.name, code, description: data.description, permissions: permissionCodes };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getPermissions(tenantKey: string) {
    const scope = await this.resolveTenant(tenantKey);
    const res = await this.db.query(
      `SELECT id, code, resource, action, description
       FROM ${scope.schema}.permissions
       ORDER BY resource ASC, action ASC, code ASC`,
    );
    return res.rows;
  }

  async getSeats(tenantKey: string) {
    const scope = await this.resolveTenant(tenantKey);
    const countRes = await this.db.query(
      `SELECT COUNT(*)::int AS count
       FROM ${scope.schema}.user_memberships
       WHERE status = 'ACTIVE'`,
    );
    const maxSeats = this.readSeatLimit(scope.tenant.max_user_seats);
    const seatsUsed = Number(countRes.rows[0]?.count ?? 0);
    const seatsAvailable = Math.max(0, maxSeats - seatsUsed);

    return {
      planTier: scope.tenant.plan_tier,
      totalLimit: maxSeats,
      used: seatsUsed,
      available: seatsAvailable,
      utilizationPct: Math.min(100, Math.round((seatsUsed / maxSeats) * 100)),
      isLimitReached: seatsUsed >= maxSeats,
    };
  }

  async getUsers(tenantKey: string) {
    const scope = await this.resolveTenant(tenantKey);
    const res = await this.db.query(`
      SELECT u.id, u.email, u.name, u.status, u.spending_limit_usd,
             u.allowed_cost_centers, u.created_at, d.name AS department_name,
             g.name AS group_name, r.name AS role_name, r.code AS role_code,
             COALESCE(
               json_agg(
                 json_build_object(
                   'permission_code', up.permission_code,
                   'effect', up.effect,
                   'expires_at', up.expires_at
                 )
               ) FILTER (WHERE up.permission_code IS NOT NULL),
               '[]'
             ) AS user_overrides
      FROM ${scope.schema}.user_memberships u
      LEFT JOIN ${scope.schema}.departments d ON u.department_id = d.id
      LEFT JOIN ${scope.schema}.groups g ON u.group_id = g.id
      LEFT JOIN ${scope.schema}.roles r ON u.role_id = r.id
      LEFT JOIN ${scope.schema}.user_permissions up ON u.id = up.user_id
      GROUP BY u.id, u.email, u.name, u.status, u.spending_limit_usd,
               u.allowed_cost_centers, u.created_at, d.name, g.name, r.name, r.code
      ORDER BY u.created_at ASC
    `);
    return res.rows;
  }

  async inviteUser(
    tenantKey: string,
    data: {
      name: string;
      email: string;
      departmentId: string;
      groupId: string;
      roleId: string;
      spendingLimitUsd?: number;
    },
  ) {
    const scope = await this.resolveTenant(tenantKey);
    const activeCountRes = await this.db.query(
      `SELECT COUNT(*)::int AS count
       FROM ${scope.schema}.user_memberships
       WHERE status = 'ACTIVE'`,
    );
    const activeCount = Number(activeCountRes.rows[0]?.count ?? 0);
    const maxSeats = this.readSeatLimit(scope.tenant.max_user_seats);
    if (activeCount >= maxSeats) {
      throw new ConflictException(
        `Tenant ${scope.slug} has reached its active-seat limit (${activeCount}/${maxSeats}).`,
      );
    }

    const spendingLimit = data.spendingLimitUsd ?? 10_000;
    this.assertNonNegativeNumber(spendingLimit, 'spendingLimitUsd');
    const id = `USR-${randomUUID().slice(0, 6).toUpperCase()}`;
    const res = await this.db.query(
      `INSERT INTO ${scope.schema}.user_memberships
         (id, email, name, department_id, group_id, role_id, status,
          spending_limit_usd, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', $7, NOW())
       RETURNING *`,
      [id, data.email, data.name, data.departmentId, data.groupId, data.roleId, spendingLimit],
    );
    return res.rows[0];
  }

  async setUserOverride(
    tenantKey: string,
    userId: string,
    data: {
      permissionCode: string;
      effect: 'GRANT' | 'DENY';
      expiresAt?: string;
      grantedBy: string;
    },
  ) {
    const scope = await this.resolveTenant(tenantKey);
    const id = `UOV-${randomUUID().slice(0, 6).toUpperCase()}`;
    const result = await this.db.query(
      `INSERT INTO ${scope.schema}.user_permissions
         (id, user_id, permission_code, effect, granted_by, expires_at, granted_at)
       SELECT $1, $2, p.code, $4, $5, $6, NOW()
       FROM ${scope.schema}.permissions p
       WHERE p.code = $3
       ON CONFLICT (user_id, permission_code)
       DO UPDATE SET effect = EXCLUDED.effect,
                     granted_by = EXCLUDED.granted_by,
                     expires_at = EXCLUDED.expires_at,
                     granted_at = NOW()
       RETURNING user_id`,
      [id, userId, data.permissionCode, data.effect, data.grantedBy, data.expiresAt ?? null],
    );
    if (result.rowCount !== 1) {
      throw new NotFoundException('The requested permission code was not found.');
    }
    return { success: true, userId, permissionCode: data.permissionCode, effect: data.effect };
  }

  async removeUserOverride(tenantKey: string, userId: string, permissionCode: string) {
    const scope = await this.resolveTenant(tenantKey);
    const result = await this.db.query(
      `DELETE FROM ${scope.schema}.user_permissions
       WHERE user_id = $1 AND permission_code = $2`,
      [userId, permissionCode],
    );
    return { success: true, removed: result.rowCount === 1, userId, permissionCode };
  }

  async updateUserLimits(
    tenantKey: string,
    userId: string,
    data: { spendingLimitUsd?: number; allowedCostCenters?: string[] },
  ) {
    const scope = await this.resolveTenant(tenantKey);
    if (data.spendingLimitUsd !== undefined) {
      this.assertNonNegativeNumber(data.spendingLimitUsd, 'spendingLimitUsd');
    }
    const result = await this.db.query(
      `UPDATE ${scope.schema}.user_memberships
       SET spending_limit_usd = COALESCE($2, spending_limit_usd),
           allowed_cost_centers = COALESCE($3, allowed_cost_centers)
       WHERE id = $1
       RETURNING id`,
      [userId, data.spendingLimitUsd ?? null, data.allowedCostCenters ?? null],
    );
    if (result.rowCount !== 1) {
      throw new NotFoundException('Tenant user was not found.');
    }
    return { success: true, userId, ...data };
  }

  async getTenantQuotaAndUsage(tenantKey: string) {
    const scope = await this.resolveTenant(tenantKey);
    const [walletRes, usageRes, usersRes] = await Promise.all([
      this.db.queryWithTenant(
        scope.id,
        `SELECT id, capability_code, capability_name, unit_name, balance,
                total_credited, total_consumed, status, updated_at
         FROM gigalibs_platform.tenant_credit_wallets
         WHERE tenant_id = $1
         ORDER BY capability_code ASC`,
        [scope.id],
      ),
      this.db.queryWithTenant(
        scope.id,
        `SELECT user_id, user_name, user_email, capability_code,
                SUM(units_consumed)::bigint AS units
         FROM gigalibs_platform.tenant_usage_ledger
         WHERE tenant_id = $1
         GROUP BY user_id, user_name, user_email, capability_code
         ORDER BY units DESC`,
        [scope.id],
      ),
      this.db.query(`
        SELECT u.id, d.name AS department, r.name AS role
        FROM ${scope.schema}.user_memberships u
        LEFT JOIN ${scope.schema}.departments d ON d.id = u.department_id
        LEFT JOIN ${scope.schema}.roles r ON r.id = u.role_id
      `),
    ]);

    const totalTenantConsumed = walletRes.rows.reduce(
      (total: number, row: any) => total + Number(row.total_consumed),
      0,
    );
    const userDetails = new Map(usersRes.rows.map((row: any) => [row.id, row]));
    const userUsage = new Map<string, any>();

    for (const row of usageRes.rows) {
      const units = Number(row.units);
      const current = userUsage.get(row.user_id) ?? {
        userId: row.user_id,
        userName: row.user_name,
        userEmail: row.user_email,
        totalUnits: 0,
        breakdown: {},
      };
      current.totalUnits += units;
      current.breakdown[row.capability_code] = units;
      userUsage.set(row.user_id, current);
    }

    const rankedUsers = [...userUsage.values()].sort((a, b) => b.totalUnits - a.totalUnits);
    const perUserAttribution = rankedUsers.map((user, index) => {
      const details = userDetails.get(user.userId) as any;
      return {
        ...user,
        department: details?.department ?? null,
        role: details?.role ?? null,
        isTopConsumer: index === 0,
        tenantSharePct:
          totalTenantConsumed > 0
            ? Math.round((user.totalUnits / totalTenantConsumed) * 100)
            : 0,
      };
    });

    return {
      tenantSlug: scope.slug,
      poolingModel: 'TENANT_SHARED_POOL',
      poolingDescription:
        'Quotas are pooled at the tenant level and every consumption event is attributed to a persisted active user.',
      totalTenantUnitsConsumed: totalTenantConsumed,
      capabilityPools: walletRes.rows.map((row: any) => {
        const credited = Number(row.total_credited);
        const consumed = Number(row.total_consumed);
        const capabilityUsage = usageRes.rows.filter(
          (usage: any) => usage.capability_code === row.capability_code,
        );
        const top = capabilityUsage[0];
        return {
          capabilityCode: row.capability_code,
          capabilityName: row.capability_name,
          unitName: row.unit_name,
          totalCredited: credited,
          totalConsumed: consumed,
          balance: Number(row.balance),
          utilizationPct: credited > 0 ? Math.round((consumed / credited) * 100) : 0,
          status: row.status,
          topConsumer: top
            ? {
                userId: top.user_id,
                userName: top.user_name,
                unitsConsumed: Number(top.units),
                pctOfCapability:
                  consumed > 0 ? Math.round((Number(top.units) / consumed) * 100) : 0,
              }
            : null,
        };
      }),
      topOverallConsumers: perUserAttribution.map((user) => ({
        userId: user.userId,
        userName: user.userName,
        userEmail: user.userEmail,
        department: user.department,
        role: user.role,
        totalUnitsConsumed: user.totalUnits,
        pctOfTenantTotal: user.tenantSharePct,
        primaryCapability:
          Object.entries(user.breakdown).sort(([, a], [, b]) => Number(b) - Number(a))[0]?.[0] ??
          null,
      })),
      perUserAttribution,
    };
  }

  async recordTenantUsage(tenantKey: string, data: UsageInput) {
    const scope = await this.resolveTenant(tenantKey);
    if (!Number.isSafeInteger(data.units) || data.units <= 0) {
      throw new BadRequestException('units must be a positive safe integer.');
    }
    if (!data.eventId?.trim() || data.eventId.length > 128) {
      throw new BadRequestException('eventId is required and must not exceed 128 characters.');
    }
    if (!data.moduleName?.trim()) {
      throw new BadRequestException('moduleName is required.');
    }

    const id = `USG-${createHash('sha256')
      .update(`${scope.id}:${data.capabilityCode}:${data.eventId}`)
      .digest('hex')
      .slice(0, 32)}`;

    return this.db.withTenantTransaction(scope.id, async (client) => {
      const existing = await client.query(
        `SELECT id, user_id, capability_code, units_consumed
         FROM gigalibs_platform.tenant_usage_ledger
         WHERE id = $1`,
        [id],
      );
      if (existing.rows[0]) {
        const event = existing.rows[0];
        if (
          event.user_id !== data.userId ||
          event.capability_code !== data.capabilityCode ||
          Number(event.units_consumed) !== data.units
        ) {
          throw new ConflictException('eventId has already been used with a different usage payload.');
        }
        return {
          success: true,
          id,
          idempotentReplay: true,
          units: data.units,
          capabilityCode: data.capabilityCode,
        };
      }

      const userRes = await client.query(
        `SELECT id, name, email
         FROM ${scope.schema}.user_memberships
         WHERE id = $1 AND status = 'ACTIVE'`,
        [data.userId],
      );
      const user = userRes.rows[0];
      if (!user) {
        throw new NotFoundException('Active tenant user was not found for usage attribution.');
      }

      const walletRes = await client.query(
        `SELECT id, balance
         FROM gigalibs_platform.tenant_credit_wallets
         WHERE tenant_id = $1 AND capability_code = $2
         FOR UPDATE`,
        [scope.id, data.capabilityCode],
      );
      const wallet = walletRes.rows[0];
      if (!wallet) {
        throw new NotFoundException('Tenant capability wallet was not found.');
      }
      if (Number(wallet.balance) < data.units) {
        throw new ConflictException('Tenant capability wallet does not have sufficient units.');
      }

      await client.query(
        `INSERT INTO gigalibs_platform.tenant_usage_ledger
           (id, tenant_id, user_id, user_email, user_name, capability_code,
            module_name, units_consumed, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, NOW())`,
        [
          id,
          scope.id,
          user.id,
          user.email,
          user.name,
          data.capabilityCode,
          data.moduleName,
          data.units,
          JSON.stringify({ ...data.metadata, sourceEventId: data.eventId }),
        ],
      );
      await client.query(
        `UPDATE gigalibs_platform.tenant_credit_wallets
         SET balance = balance - $1,
             total_consumed = total_consumed + $1,
             status = CASE WHEN balance - $1 = 0 THEN 'EXHAUSTED' ELSE 'ACTIVE' END,
             updated_at = NOW()
         WHERE id = $2`,
        [data.units, wallet.id],
      );

      return {
        success: true,
        id,
        idempotentReplay: false,
        units: data.units,
        capabilityCode: data.capabilityCode,
      };
    });
  }

  private async resolveTenant(tenantKey: string): Promise<TenantScope> {
    const result = await this.db.query(
      `SELECT id, name, slug, subdomain, custom_domain, status, plan_tier,
              entitled_modules, primary_contact_email, allocated_schemas,
              max_user_seats, created_at
       FROM gigalibs_platform.platform_tenants
       WHERE id = $1 OR slug = $2`,
      [tenantKey, tenantKey.toLowerCase()],
    );
    const tenant = result.rows[0];
    if (!tenant) {
      throw new NotFoundException('Tenant was not found.');
    }

    const derivedSchema = `tenant_${String(tenant.slug).replace(/-/g, '_')}_core`;
    const allocatedSchemas = Array.isArray(tenant.allocated_schemas)
      ? tenant.allocated_schemas
      : [];
    const schema =
      allocatedSchemas.find(
        (candidate: unknown) =>
          typeof candidate === 'string' &&
          candidate.endsWith('_core') &&
          this.isSafeIdentifier(candidate),
      ) ?? derivedSchema;
    if (!this.isSafeIdentifier(schema)) {
      throw new ServiceUnavailableException('Tenant core schema configuration is invalid.');
    }

    return { id: tenant.id, slug: tenant.slug, schema: `"${schema}"`, tenant };
  }

  private isSafeIdentifier(value: string): boolean {
    return /^[a-z_][a-z0-9_]{0,62}$/.test(value);
  }

  private readSeatLimit(value: unknown): number {
    const limit = Number(value);
    if (!Number.isSafeInteger(limit) || limit <= 0) {
      throw new ServiceUnavailableException('Tenant seat configuration is invalid.');
    }
    return limit;
  }

  private assertNonNegativeNumber(value: number, fieldName: string): void {
    if (!Number.isFinite(value) || value < 0) {
      throw new BadRequestException(`${fieldName} must be a non-negative number.`);
    }
  }
}
