"""Certifies controlled key rotation in an isolated PostgreSQL database."""
import base64
import json
import os
import re
import secrets
import shlex
import signal
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[5]
OUT = Path(__file__).parent
name = 'gigalibs_key_rotation_cert_' + secrets.token_hex(6)
password = secrets.token_hex(32)
assert re.fullmatch(r'gigalibs_key_rotation_cert_[a-f0-9]+', name)
admin = ['psql', '-X', '-w', '-h', '127.0.0.1', '-p', '5432', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At']
role_created = database_created = False
server = None
log = None
cleanup = {'databaseRemoved': False, 'roleRemoved': False}
result = {'check': 'control-key-rotation', 'exitCode': None}


def sql(statement):
    completed = subprocess.run(admin, input=statement, text=True, capture_output=True, timeout=15)
    if completed.returncode:
        raise RuntimeError('Certification database administration failed: ' + completed.stderr.replace(password, '[redacted]'))
    return completed.stdout.strip()


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
    old_key = base64.b64encode(secrets.token_bytes(32)).decode()
    active_key = base64.b64encode(secrets.token_bytes(32)).decode()
    env.update({
        'DATABASE_URL': f'postgresql://{name}:{password}@127.0.0.1:5432/{name}',
        'CONTROL_PAYLOAD_ENCRYPTION_KEY': active_key,
        'CONTROL_PAYLOAD_KEY_VERSION': 'rotation-v2',
        'CONTROL_PAYLOAD_PREVIOUS_KEYS_JSON': json.dumps({'rotation-v1': old_key}),
        'TENANT_EXPORT_SIGNING_KEY_ID': '',
        'TENANT_EXPORT_SIGNING_PRIVATE_KEY_BASE64': '',
        'NODE_ENV': 'test', 'API_HOST': '127.0.0.1', 'API_PORT': '3341',
        'CORS_ORIGINS': 'http://127.0.0.1:5199',
        'CONTROL_OUTBOX_POLL_INTERVAL_SECONDS': '3600',
        'STORAGE_CLEANUP_INTERVAL_SECONDS': '3600',
        'RETENTION_WORKER_INTERVAL_SECONDS': '3600',
        'OIDC_ALLOW_TEST_LOOPBACK': 'true',
        'OIDC_REDIRECT_URI': 'http://127.0.0.1:5199/api/auth/oidc/callback',
    })
    migration = subprocess.run(
        ['node', str(ROOT / 'packages/db/node_modules/prisma/build/index.js'), 'migrate', 'deploy'],
        cwd=ROOT / 'packages/db', env=env, capture_output=True, text=True, timeout=120,
    )
    (OUT / 'control-key-rotation-migration.txt').write_text(
        (migration.stdout + migration.stderr).replace(password, '[redacted]').replace(env['DATABASE_URL'], '[redacted]')
    )
    if migration.returncode:
        raise RuntimeError('Migration failed; see control-key-rotation-migration.txt')

    log = tempfile.TemporaryFile(mode='w+')
    server = subprocess.Popen(
        ['node', str(ROOT / 'apps/playground-api/dist/main.js')],
        cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True,
    )
    deadline = time.monotonic() + 25
    while time.monotonic() < deadline:
        if server.poll() is not None:
            break
        try:
            with urllib.request.urlopen('http://127.0.0.1:3341/api/v1/ready', timeout=1) as response:
                if response.status == 200:
                    break
        except Exception:
            time.sleep(0.2)
    else:
        raise RuntimeError('Control plane did not become ready')
    if server.poll() is not None:
        log.seek(0)
        startup_output = log.read()
        for secret in [password, env['DATABASE_URL'], active_key, old_key, env['JWT_ACCESS_SECRET']]:
            startup_output = startup_output.replace(secret, '[redacted]')
        (OUT / 'control-key-rotation-startup-failure.txt').write_text(startup_output)
        raise RuntimeError('Control plane exited before certification')

    completed = subprocess.run(
        ['node', str(OUT / 'verify-control-key-rotation.mjs')],
        cwd=ROOT, env=env, capture_output=True, text=True, timeout=120,
    )
    output = completed.stdout + completed.stderr
    for secret in [password, env['DATABASE_URL'], active_key, old_key, env['JWT_ACCESS_SECRET']]:
        output = output.replace(secret, '[redacted]')
    (OUT / 'control-key-rotation.txt').write_text(output)
    result['exitCode'] = completed.returncode
    if completed.returncode:
        raise RuntimeError('Key rotation verification failed; see control-key-rotation.txt')
finally:
    if server and server.poll() is None:
        os.killpg(server.pid, signal.SIGTERM)
        try:
            server.wait(timeout=8)
        except subprocess.TimeoutExpired:
            os.killpg(server.pid, signal.SIGKILL)
            server.wait(timeout=3)
    if log:
        log.close()
    if database_created:
        sql(f'DROP DATABASE {name} WITH (FORCE);')
        cleanup['databaseRemoved'] = True
    if role_created:
        sql(f'DROP ROLE {name};')
        cleanup['roleRemoved'] = True
    record = {
        'database': name,
        'postgresVersion': '14.20',
        'runtimeRole': 'dedicated non-superuser',
        'source': 'Isolated attributable rotation records created through real API and database setup',
        'checks': [result],
        'cleanup': cleanup,
        'passed': result['exitCode'] == 0 and all(cleanup.values()),
    }
    (OUT / 'control-key-rotation-run.json').write_text(json.dumps(record, indent=2) + '\n')
    print(json.dumps(record), flush=True)
