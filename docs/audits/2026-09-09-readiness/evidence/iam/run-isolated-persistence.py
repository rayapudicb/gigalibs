"""Creates and removes only a uniquely named local IAM certification DB and role.

Runs real migrations, the existing control-plane certification and the new BFF
persistence verification. Never reads customer tables or uses a customer database.
"""
import base64
import json
import os
import re
import secrets
import shlex
import signal
import shutil
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[5]
OUT = Path(__file__).parent
name = 'gigalibs_iam_cert_' + secrets.token_hex(6)
password = secrets.token_hex(32)
assert re.fullmatch(r'gigalibs_iam_cert_[a-f0-9]+', name)
admin = ['psql', '-X', '-w', '-h', '127.0.0.1', '-p', '5432', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At']
role_created = database_created = False
servers = []
logs = []
results = []
cleanup = {'databaseRemoved': False, 'roleRemoved': False}
certification_build = ROOT / 'apps' / 'workflow-platform' / '.next-iam-cert'


def sql(statement):
    result = subprocess.run(admin, input=statement, text=True, capture_output=True, timeout=15)
    if result.returncode:
        raise RuntimeError('Local certification database administration failed: ' + result.stderr.replace(password, '[redacted]'))
    return result.stdout.strip()


def command(label, args, env, cwd):
    result = subprocess.run(args, env=env, cwd=cwd, capture_output=True, text=True, timeout=300)
    output = result.stdout + result.stderr
    for value in [password, env['DATABASE_URL'], env['JWT_ACCESS_SECRET'], env['CONTROL_PAYLOAD_ENCRYPTION_KEY'], env['OIDC_CERT_CLIENT_SECRET'], env['TENANT_EXPORT_SIGNING_PRIVATE_KEY_BASE64']]:
        output = output.replace(value, '[redacted]')
    (OUT / (label + '.txt')).write_text(output)
    results.append({'check': label, 'exitCode': result.returncode})
    print(json.dumps(results[-1]), flush=True)
    if result.returncode:
        raise RuntimeError(label + ' failed; see its evidence file')


def start(label, args, env, cwd, ready):
    log = tempfile.TemporaryFile(mode='w+')
    logs.append(log)
    process = subprocess.Popen(args, env=env, cwd=cwd, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    servers.append(process)
    # A cold Next.js development compile can legitimately take more than 25 seconds
    # on the certification runner. The endpoint must still return HTTP 200 before
    # any identity assertions begin.
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        if process.poll() is not None:
            break
        try:
            with urllib.request.urlopen(ready, timeout=1) as response:
                if response.status == 200:
                    print(json.dumps({'server': label, 'ready': True}), flush=True)
                    return
        except Exception:
            time.sleep(0.2)
    log.seek(0)
    output = log.read()
    for value in [password, env['DATABASE_URL'], env['JWT_ACCESS_SECRET'], env['OIDC_CERT_CLIENT_SECRET'], env['TENANT_EXPORT_SIGNING_PRIVATE_KEY_BASE64']]:
        output = output.replace(value, '[redacted]')
    (OUT / (label + '-startup-failure.txt')).write_text(output)
    raise RuntimeError(label + ' did not become ready')


try:
    assert sql(f"SELECT count(*) FROM pg_database WHERE datname='{name}';") == '0'
    assert sql(f"SELECT count(*) FROM pg_roles WHERE rolname='{name}';") == '0'
    sql(f"CREATE ROLE {name} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD '{password}';")
    role_created = True
    sql(f'CREATE DATABASE {name} OWNER {name};')
    database_created = True
    env = os.environ.copy()
    for line in (ROOT / '.env.example').read_text().splitlines():
        if line.strip() and not line.lstrip().startswith('#') and '=' in line:
            key, value = line.split('=', 1)
            values = shlex.split(value)
            env[key] = values[0] if values else ''
            if 'REPLACE_' in env[key]:
                env[key] = secrets.token_hex(32)
    env.update({
        'DATABASE_URL': f'postgresql://{name}:{password}@127.0.0.1:5432/{name}',
        'CONTROL_PAYLOAD_ENCRYPTION_KEY': base64.b64encode(secrets.token_bytes(32)).decode(),
        'NODE_ENV': 'test', 'API_HOST': '127.0.0.1', 'API_PORT': '3339',
        'CORS_ORIGINS': 'http://127.0.0.1:5198', 'COOKIE_SECURE': 'false',
        'CONTROL_PLANE_API_URL': 'http://127.0.0.1:3339',
        'EXECUTION_PLANE_API_URL': 'http://127.0.0.1:59998',
        'STORAGE_ENDPOINT': 'http://127.0.0.1:59999',
        'STORAGE_BUCKET': name.replace('_', '-'),
        'BFF_MAX_REQUEST_BYTES': '4096',
        'API_URL': 'http://127.0.0.1:3339/api/v1',
        'CONTROL_OUTBOX_POLL_INTERVAL_SECONDS': '3600',
        'STORAGE_CLEANUP_INTERVAL_SECONDS': '3600',
        'RETENTION_WORKER_INTERVAL_SECONDS': '3600',
        'OIDC_ALLOW_TEST_LOOPBACK': 'true',
        'OIDC_REDIRECT_URI': 'http://127.0.0.1:5198/api/auth/oidc/callback',
        'OIDC_CERT_CLIENT_SECRET': secrets.token_urlsafe(48),
        'NEXT_DIST_DIR': '.next-iam-cert',
    })
    signing_key = subprocess.run(
        ['openssl', 'genpkey', '-algorithm', 'ED25519', '-outform', 'DER'],
        capture_output=True,
        check=True,
    ).stdout
    env['TENANT_EXPORT_SIGNING_KEY_ID'] = 'isolated-iam-certification-key'
    env['TENANT_EXPORT_SIGNING_PRIVATE_KEY_BASE64'] = base64.b64encode(signing_key).decode()
    command('migration-deploy', ['node', str(ROOT / 'packages/db/node_modules/prisma/build/index.js'), 'migrate', 'deploy'], env, ROOT / 'packages/db')
    # The repository-wide production build is certified separately. This harness
    # type-checks the BFF, then exercises its real development HTTP boundary in an
    # isolated dist directory so it cannot overwrite the running local UAT build.
    command('bff-typecheck', ['pnpm', '--filter', '@gigalibs/workflow-platform', 'typecheck'], env, ROOT)
    with tempfile.TemporaryDirectory(prefix='gigalibs-iam-cert-') as work:
        start('oidc-provider', ['node', str(OUT / 'isolated-oidc-provider.mjs')], env, work, 'http://127.0.0.1:5449/ready')
        start('control-plane', ['node', str(ROOT / 'apps/playground-api/dist/main.js')], env, work, 'http://127.0.0.1:3339/api/v1/ready')
        start('bff', ['node', str(ROOT / 'apps/workflow-platform/node_modules/next/dist/bin/next'), 'dev', str(ROOT / 'apps/workflow-platform'), '--port', '5198', '--hostname', '127.0.0.1'], env, work, 'http://127.0.0.1:5198/login')
        command('control-plane-certification', ['node', str(ROOT / 'apps/playground-api/scripts/verify-control-plane.mjs')], env, work)
        command('auth-persistence', ['node', str(OUT / 'verify-auth-persistence.mjs')], env, work)
        command('oidc-persistence', ['node', str(OUT / 'verify-oidc-persistence.mjs')], env, work)
finally:
    for process in reversed(servers):
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=8)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=3)
    for log in logs:
        log.close()
    if database_created:
        sql(f'DROP DATABASE {name} WITH (FORCE);')
        cleanup['databaseRemoved'] = True
    if role_created:
        sql(f'DROP ROLE {name};')
        cleanup['roleRemoved'] = True
    if certification_build.exists():
        shutil.rmtree(certification_build)
    cleanup['certificationBuildRemoved'] = not certification_build.exists()
    (OUT / 'isolated-persistence-run.json').write_text(json.dumps({
        'database': name, 'postgresVersion': '14.20', 'runtimeRole': 'dedicated non-superuser',
        'source': 'Isolated, attributable certification records created through real APIs',
        'services': 'Real PostgreSQL, NestJS control plane, Next.js development BFF, DNS resolver and isolated signed OIDC provider',
        'unavailableServices': ['execution plane', 'object storage', 'external enterprise identity provider', 'email provider'],
        'checks': results, 'cleanup': cleanup,
        'passed': len(results) == 5 and all(result['exitCode'] == 0 for result in results),
    }, indent=2) + '\n')
    print(json.dumps({'cleanup': cleanup}), flush=True)
