"""Verify the IAM timestamp migration against an isolated real PostgreSQL database.

The script applies every prior control-plane migration, creates attributable
pre-upgrade records, applies the new migration, checks type/value compatibility,
and removes its uniquely named database and role.
"""

import json
import os
import re
import secrets
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[5]
OUT = Path(__file__).parent
MIGRATIONS = ROOT / "packages" / "db" / "migrations"
TARGET = "20260909000000_iam_timestamptz"
ASSIGNMENT_TARGET = "20260909001000_custom_role_assignment"
MFA_TARGET = "20260909002000_totp_mfa_enforcement"
DOMAIN_TARGET = "20260909003000_tenant_domain_verification"
RECOVERY_TARGET = "20260909004000_mfa_recovery_codes"
OIDC_TARGET = "20260909005000_tenant_oidc"
name = "gigalibs_iam_time_" + secrets.token_hex(6)
password = secrets.token_hex(32)
assert re.fullmatch(r"gigalibs_iam_time_[a-f0-9]+", name)

admin = [
    "psql", "-X", "-w", "-h", "127.0.0.1", "-p", "5432", "-d", "postgres",
    "-v", "ON_ERROR_STOP=1", "-At",
]
runtime = [
    "psql", "-X", "-w", "-h", "127.0.0.1", "-p", "5432", "-U", name,
    "-d", name, "-v", "ON_ERROR_STOP=1", "-At",
]
runtime_env = {**os.environ, "PGPASSWORD": password}
database_created = False
role_created = False
checks = []


def run(args, *, statement=None, env=None):
    result = subprocess.run(
        args,
        input=statement,
        text=True,
        capture_output=True,
        timeout=90,
        env=env,
    )
    if result.returncode:
        detail = (result.stdout + result.stderr).replace(password, "[redacted]")
        raise RuntimeError(detail)
    return result.stdout.strip()


def admin_sql(statement):
    return run(admin, statement=statement)


def db_sql(statement):
    return run(runtime, statement=statement, env=runtime_env)


try:
    assert admin_sql(f"SELECT count(*) FROM pg_database WHERE datname='{name}';") == "0"
    assert admin_sql(f"SELECT count(*) FROM pg_roles WHERE rolname='{name}';") == "0"
    admin_sql(
        f"CREATE ROLE {name} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT "
        f"PASSWORD '{password}';"
    )
    role_created = True
    admin_sql(f"CREATE DATABASE {name} OWNER {name};")
    database_created = True

    migration_dirs = sorted(
        path for path in MIGRATIONS.iterdir()
        if path.is_dir() and path.name < TARGET
    )
    assert migration_dirs, "Expected prior migrations"
    for migration in migration_dirs:
        run(runtime + ["-f", str(migration / "migration.sql")], env=runtime_env)
    checks.append(f"Applied {len(migration_dirs)} prior migrations to an empty isolated database")

    assert db_sql("""
      SELECT data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='sessions' AND column_name='expiresAt';
    """) == "timestamp without time zone"
    db_sql("""
      SET TIME ZONE 'Asia/Kolkata';
      INSERT INTO tenants (id, slug, name, "createdAt", "updatedAt")
      VALUES ('iam-time-tenant', 'iam-time-tenant', 'IAM timestamp migration verification',
              TIMESTAMP '2026-01-02 03:04:05.678', TIMESTAMP '2026-01-02 03:04:05.678');
      INSERT INTO users (id, email, name, status, "createdAt", "updatedAt")
      VALUES ('iam-time-user', 'iam-time@example.invalid', 'IAM timestamp migration verification', 'ACTIVE',
              TIMESTAMP '2026-01-02 03:04:05.678', TIMESTAMP '2026-01-02 03:04:05.678');
      INSERT INTO sessions (id, "refreshToken", status, "expiresAt", "userId", "tenantId", "createdAt")
      VALUES ('iam-time-session', 'non-secret-migration-verification', 'ACTIVE',
              TIMESTAMP '2026-01-02 03:04:05.678', 'iam-time-user', 'iam-time-tenant',
              TIMESTAMP '2026-01-02 03:04:05.678');
    """)
    checks.append("Created attributable pre-upgrade records while the database timezone was Asia/Kolkata")

    run(runtime + ["-f", str(MIGRATIONS / TARGET / "migration.sql")], env=runtime_env)
    target_columns = db_sql("""
      SELECT count(*) FROM information_schema.columns
      WHERE table_schema='public'
        AND data_type='timestamp with time zone'
        AND (table_name, column_name) IN (
          ('tenants','provisionedAt'), ('tenants','trialEndsAt'), ('tenants','createdAt'), ('tenants','updatedAt'),
          ('tenant_settings','createdAt'), ('tenant_settings','updatedAt'),
          ('users','emailVerifiedAt'), ('users','phoneVerifiedAt'), ('users','lastLoginAt'), ('users','createdAt'), ('users','updatedAt'),
          ('sessions','expiresAt'), ('sessions','revokedAt'), ('sessions','createdAt'),
          ('passkeys','lastUsedAt'), ('passkeys','createdAt'),
          ('otps','expiresAt'), ('otps','usedAt'), ('otps','createdAt'),
          ('tenant_members','joinedAt'), ('tenant_members','updatedAt'),
          ('tenant_invites','expiresAt'), ('tenant_invites','acceptedAt'), ('tenant_invites','revokedAt'), ('tenant_invites','createdAt'),
          ('audit_logs','createdAt'),
          ('tenant_environments','expiresAt'), ('tenant_environments','createdAt'), ('tenant_environments','updatedAt'),
          ('custom_roles','createdAt'), ('custom_roles','updatedAt'),
          ('user_groups','createdAt'), ('user_groups','updatedAt')
        ) AND datetime_precision=3;
    """)
    assert target_columns == "33", target_columns
    checks.append("Converted all 33 target columns to millisecond-precision timestamptz")

    preserved = db_sql("""
      SET TIME ZONE 'Asia/Kolkata';
      SELECT to_char("expiresAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS.MS')
      FROM sessions WHERE id='iam-time-session';
    """).splitlines()[-1]
    assert preserved == "2026-01-02 03:04:05.678", preserved
    checks.append("Preserved the UTC instant previously observed by Prisma for an existing session")

    default_skew = db_sql("""
      SET TIME ZONE 'Asia/Kolkata';
      INSERT INTO audit_logs (id, action, resource, "tenantId")
      VALUES ('iam-time-audit', 'CREATE', 'iam-time-verification', 'iam-time-tenant');
      SELECT (abs(extract(epoch FROM ("createdAt" - CURRENT_TIMESTAMP))) < 5)::text
      FROM audit_logs WHERE id='iam-time-audit';
    """).splitlines()[-1]
    assert default_skew == "true", default_skew
    checks.append("Database defaults now create the correct instant under a non-UTC database timezone")

    session_default_skew = db_sql("""
      SET TIME ZONE 'Asia/Kolkata';
      INSERT INTO sessions (id, "refreshToken", status, "expiresAt", "userId", "tenantId")
      VALUES ('iam-time-new-session', 'non-secret-post-migration-verification', 'ACTIVE',
              CURRENT_TIMESTAMP + INTERVAL '1 hour', 'iam-time-user', 'iam-time-tenant');
      SELECT (abs(extract(epoch FROM ("createdAt" - CURRENT_TIMESTAMP))) < 5)::text
      FROM sessions WHERE id='iam-time-new-session';
    """).splitlines()[-1]
    assert session_default_skew == "true", session_default_skew
    checks.append("New session defaults are not shifted by the database timezone after migration")

    db_sql("""
      INSERT INTO custom_roles
        (id, "tenantId", name, permissions, "createdAt", "updatedAt")
      VALUES
        ('iam-upgrade-role', 'iam-time-tenant', 'Existing upgrade role', '["settings:read"]'::jsonb,
         CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
      INSERT INTO tenant_members
        (id, role, status, "userId", "tenantId", "joinedAt", "updatedAt")
      VALUES
        ('iam-upgrade-member', 'VIEWER', 'ACTIVE', 'iam-time-user', 'iam-time-tenant',
         CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
    """)
    run(runtime + ["-f", str(MIGRATIONS / ASSIGNMENT_TARGET / "migration.sql")], env=runtime_env)
    assignment_integrity = db_sql("""
      UPDATE tenant_members SET "customRoleId"='iam-upgrade-role' WHERE id='iam-upgrade-member';
      DELETE FROM custom_roles WHERE id='iam-upgrade-role';
      SELECT ("customRoleId" IS NULL)::text FROM tenant_members WHERE id='iam-upgrade-member';
    """).splitlines()[-1]
    assert assignment_integrity == "true", assignment_integrity
    checks.append("Added nullable custom-role assignment to existing memberships and verified referential cleanup")

    run(runtime + ["-f", str(MIGRATIONS / MFA_TARGET / "migration.sql")], env=runtime_env)
    mfa_columns = db_sql("""
      SELECT count(*) FROM information_schema.columns
      WHERE table_schema='public' AND data_type='timestamp with time zone'
        AND datetime_precision=3
        AND (table_name, column_name) IN (
          ('sessions','mfaVerifiedAt'),
          ('totp_credentials','verifiedAt'), ('totp_credentials','lockedUntil'),
          ('totp_credentials','createdAt'), ('totp_credentials','updatedAt')
        );
    """)
    assert mfa_columns == "5", mfa_columns
    mfa_upgrade_integrity = db_sql("""
      SELECT ("mfaVerifiedAt" IS NULL)::text FROM sessions WHERE id='iam-time-session';
      INSERT INTO totp_credentials
        (id, "secretEnvelope", "keyVersion", "userId", "createdAt", "updatedAt")
      VALUES
        ('iam-upgrade-totp', 'non-secret-encrypted-envelope-verification', 'test-v1',
         'iam-time-user', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
      DELETE FROM totp_credentials WHERE id='iam-upgrade-totp';
      SELECT (count(*)=0)::text FROM totp_credentials WHERE id='iam-upgrade-totp';
    """).splitlines()
    assert mfa_upgrade_integrity[0] == "true", mfa_upgrade_integrity
    assert mfa_upgrade_integrity[-1] == "true", mfa_upgrade_integrity
    checks.append("Added nullable session MFA state and encrypted TOTP credential storage without changing existing sessions")

    db_sql("""
      UPDATE tenants SET "customDomain"='legacy-upgrade.example.invalid'
      WHERE id='iam-time-tenant';
    """)
    run(runtime + ["-f", str(MIGRATIONS / DOMAIN_TARGET / "migration.sql")], env=runtime_env)
    domain_columns = db_sql("""
      SELECT count(*) FROM information_schema.columns
      WHERE table_schema='public' AND table_name='tenants'
        AND data_type='timestamp with time zone' AND datetime_precision=3
        AND column_name IN (
          'customDomainChallengeExpiresAt', 'customDomainVerifiedAt',
          'customDomainVerificationLockedUntil'
        );
    """)
    assert domain_columns == "3", domain_columns
    legacy_domain_state = db_sql("""
      SELECT ("customDomain" IS NULL
        AND "customDomainChallengeDomain"='legacy-upgrade.example.invalid'
        AND "customDomainVerifiedAt" IS NULL
        AND "customDomainVerificationDigest" IS NULL
        AND "customDomainVerificationAttempts"=0)::text
      FROM tenants WHERE id='iam-time-tenant';
    """).splitlines()[-1]
    assert legacy_domain_state == "true", legacy_domain_state
    pending_claims_do_not_reserve = db_sql("""
      INSERT INTO tenants (id, slug, name, "createdAt", "updatedAt")
      VALUES ('iam-time-tenant-two', 'iam-time-tenant-two', 'Concurrent pending domain verification',
              CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
      UPDATE tenants SET "customDomainChallengeDomain"='shared-pending.example.invalid'
      WHERE id IN ('iam-time-tenant', 'iam-time-tenant-two');
      SELECT (count(*)=2)::text FROM tenants
      WHERE "customDomainChallengeDomain"='shared-pending.example.invalid';
    """).splitlines()[-1]
    assert pending_claims_do_not_reserve == "true", pending_claims_do_not_reserve
    checks.append("Moved legacy domains to unverified candidates and proved pending claims do not reserve the trusted-domain unique slot")

    run(runtime + ["-f", str(MIGRATIONS / RECOVERY_TARGET / "migration.sql")], env=runtime_env)
    recovery_columns = db_sql("""
      SELECT count(*) FROM information_schema.columns
      WHERE table_schema='public' AND table_name='mfa_recovery_codes'
        AND data_type='timestamp with time zone' AND datetime_precision=3
        AND column_name IN ('usedAt', 'createdAt');
    """)
    assert recovery_columns == "2", recovery_columns
    recovery_integrity = db_sql("""
      INSERT INTO users (id, email, name, status, "createdAt", "updatedAt")
      VALUES ('iam-recovery-user', 'iam-recovery@example.invalid', 'Recovery migration verification',
              'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
      INSERT INTO mfa_recovery_codes (id, "codeDigest", "userId")
      VALUES ('iam-recovery-code', repeat('a', 64), 'iam-recovery-user');
      SELECT ("usedAt" IS NULL AND abs(extract(epoch FROM ("createdAt" - CURRENT_TIMESTAMP))) < 5)::text
      FROM mfa_recovery_codes WHERE id='iam-recovery-code';
      DELETE FROM users WHERE id='iam-recovery-user';
      SELECT (count(*)=0)::text FROM mfa_recovery_codes WHERE id='iam-recovery-code';
    """).splitlines()
    assert recovery_integrity[-3] == "true", recovery_integrity
    assert recovery_integrity[-1] == "true", recovery_integrity
    checks.append("Added millisecond-precision one-time recovery-code storage and verified user cascade cleanup")

    run(runtime + ["-f", str(MIGRATIONS / OIDC_TARGET / "migration.sql")], env=runtime_env)
    oidc_columns = db_sql("""
      SELECT count(*) FROM information_schema.columns
      WHERE table_schema='public' AND data_type='timestamp with time zone'
        AND datetime_precision=3
        AND (table_name, column_name) IN (
          ('tenant_oidc_configurations','createdAt'), ('tenant_oidc_configurations','updatedAt'),
          ('oidc_login_transactions','expiresAt'), ('oidc_login_transactions','consumedAt'),
          ('oidc_login_transactions','createdAt'), ('external_identities','lastLoginAt'),
          ('external_identities','createdAt')
        );
    """)
    assert oidc_columns == "7", oidc_columns
    oidc_integrity = db_sql("""
      INSERT INTO tenant_oidc_configurations
        (id, issuer, "clientId", "clientSecretEnvelope", "keyVersion", "configuredById", "tenantId", "updatedAt")
      VALUES
        ('iam-oidc-config', 'https://issuer.example.invalid', 'client', 'v1.envelope', 'test-v1',
         'iam-time-user', 'iam-time-tenant', CURRENT_TIMESTAMP);
      INSERT INTO oidc_login_transactions
        (id, "stateDigest", nonce, "codeVerifierEnvelope", "keyVersion", "expiresAt", "tenantId", "configurationId")
      VALUES
        ('iam-oidc-flow', repeat('b', 64), 'nonce', 'v1.envelope', 'test-v1',
         CURRENT_TIMESTAMP + INTERVAL '10 minutes', 'iam-time-tenant', 'iam-oidc-config');
      DELETE FROM tenant_oidc_configurations WHERE id='iam-oidc-config';
      SELECT (count(*)=0)::text FROM oidc_login_transactions WHERE id='iam-oidc-flow';
    """).splitlines()[-1]
    assert oidc_integrity == "true", oidc_integrity
    checks.append("Added encrypted tenant OIDC configuration, one-time login transactions and identity mappings with cascade cleanup")
finally:
    if database_created:
        admin_sql(f"DROP DATABASE {name} WITH (FORCE);")
    if role_created:
        admin_sql(f"DROP ROLE {name};")
    result = {
        "passed": len(checks) == 11,
        "database": name,
        "source": "Isolated attributable migration records; no customer data",
        "checks": checks,
        "cleanup": {"databaseRemoved": database_created, "roleRemoved": role_created},
    }
    (OUT / "iam-timestamptz-upgrade-results.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result))
