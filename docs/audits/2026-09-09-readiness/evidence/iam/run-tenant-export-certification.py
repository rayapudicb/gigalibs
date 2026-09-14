"""Runs tenant export against disposable PostgreSQL and MinIO, then deletes both data stores."""
import base64
import json
import os
import secrets
import signal
import socket
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[5]
OUT = Path(__file__).parent
NAME = 'gigalibs_export_cert_' + secrets.token_hex(6)
WORK = tempfile.TemporaryDirectory(prefix='gigalibs-export-cert-')
BASE = Path(WORK.name)
PROCESSES = []
LOGS = []
RESULTS = []
VOLUME_ATTACHED = False


def free_port():
    with socket.socket() as candidate:
        candidate.bind(('127.0.0.1', 0))
        return candidate.getsockname()[1]


def run(label, args, env, cwd, timeout=180):
    result = subprocess.run(args, env=env, cwd=cwd, capture_output=True, text=True, timeout=timeout)
    output = result.stdout + result.stderr
    for secret in [env.get('STORAGE_SECRET_KEY'), env.get('TENANT_EXPORT_SIGNING_PRIVATE_KEY_BASE64'), env.get('JWT_ACCESS_SECRET')]:
        if secret:
            output = output.replace(secret, '[redacted]')
    (OUT / f'{label}.txt').write_text(output)
    RESULTS.append({'check': label, 'exitCode': result.returncode})
    print(json.dumps(RESULTS[-1]), flush=True)
    if result.returncode:
        raise RuntimeError(f'{label} failed; see {label}.txt')


def start(label, args, env, cwd, ready):
    log = tempfile.TemporaryFile(mode='w+')
    LOGS.append(log)
    process = subprocess.Popen(args, env=env, cwd=cwd, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    PROCESSES.append(process)
    deadline = time.monotonic() + 40
    while time.monotonic() < deadline:
        if process.poll() is not None:
            break
        try:
            with urllib.request.urlopen(ready, timeout=1) as response:
                if response.status == 200:
                    return
        except Exception:
            time.sleep(0.2)
    log.seek(0)
    (OUT / f'{label}-startup-failure.txt').write_text(log.read())
    raise RuntimeError(f'{label} did not become ready')


def start_process(args, env, cwd):
    log = tempfile.TemporaryFile(mode='w+')
    LOGS.append(log)
    process = subprocess.Popen(args, env=env, cwd=cwd, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    PROCESSES.append(process)
    return process


pg_port, minio_port, console_port, api_port = [free_port() for _ in range(4)]
env = os.environ.copy()
env.update({
    'DATABASE_URL': f'postgresql://postgres@127.0.0.1:{pg_port}/{NAME}',
    'NODE_ENV': 'test',
    'API_HOST': '127.0.0.1',
    'API_PORT': str(api_port),
    'CORS_ORIGINS': 'http://127.0.0.1:5199',
    'JWT_ACCESS_SECRET': secrets.token_hex(32),
    'JWT_REFRESH_SECRET': secrets.token_hex(32),
    'JWT_ACCESS_EXPIRES_IN': '15m',
    'JWT_REFRESH_EXPIRES_IN': '30d',
    'WORKFLOW_SCHEMA_VERSION': '1.0',
    'WORKFLOW_COMPILER_VERSION': '1.0',
    'WORKFLOW_PUBLISH_MAX_RETRIES': '3',
    'EXECUTION_EVENT_SOURCE_ID': 'export-certification',
    'EXECUTION_EVENT_SIGNING_SECRET': secrets.token_hex(32),
    'EXECUTION_EVENT_MAX_SKEW_SECONDS': '300',
    'CONNECTOR_HTTP_ALLOWED_HOSTS': '',
    'CONNECTOR_HTTP_ALLOWED_PORTS': '443',
    'CONNECTOR_HTTP_ALLOW_INSECURE': 'false',
    'CONNECTOR_HTTP_ALLOW_PRIVATE_NETWORKS': 'false',
    'CONNECTOR_HTTP_TIMEOUT_SECONDS': '10',
    'CONNECTOR_HTTP_MAX_RESPONSE_BYTES': '1048576',
    'CONNECTOR_FAILURE_THRESHOLD': '5',
    'CONNECTOR_CIRCUIT_COOLDOWN_SECONDS': '300',
    'CONNECTOR_DATABASE_ALLOWED_HOSTS': '',
    'CONNECTOR_DATABASE_ALLOWED_PORTS': '5432',
    'CONNECTOR_DATABASE_ALLOW_PRIVATE_NETWORKS': 'false',
    'STORAGE_ENDPOINT': f'http://127.0.0.1:{minio_port}',
    'STORAGE_REGION': 'us-east-1',
    'STORAGE_BUCKET': NAME.replace('_', '-'),
    'STORAGE_ACCESS_KEY': 'exportcert',
    'STORAGE_SECRET_KEY': secrets.token_hex(24),
    'STORAGE_FORCE_PATH_STYLE': 'true',
    'STORAGE_ALLOW_INSECURE': 'true',
    'STORAGE_PRESIGN_SECONDS': '60',
    'STORAGE_MAX_FILE_BYTES': '52428800',
    'STORAGE_CLEANUP_INTERVAL_SECONDS': '3600',
    'STORAGE_CLEANUP_BATCH_SIZE': '10',
    'RETENTION_WORKER_INTERVAL_SECONDS': '3600',
    'RETENTION_ENVIRONMENT_BATCH_SIZE': '10',
    'RETENTION_EVENT_BATCH_SIZE': '10',
    'CONTROL_PAYLOAD_ENCRYPTION_KEY': base64.b64encode(secrets.token_bytes(32)).decode(),
    'CONTROL_PAYLOAD_KEY_VERSION': 'export-cert-key',
    'CONTROL_OUTBOX_POLL_INTERVAL_SECONDS': '3600',
    'CONTROL_OUTBOX_BATCH_SIZE': '10',
    'CONTROL_OUTBOX_CLAIM_TIMEOUT_SECONDS': '60',
    'CONTROL_OUTBOX_MAX_ATTEMPTS': '3',
    'CONTROL_OUTBOX_RETRY_BASE_SECONDS': '1',
    'CONTROL_OUTBOX_RETRY_MAX_SECONDS': '10',
    'OBSERVABILITY_METRICS_TOKEN': secrets.token_hex(32),
    'TENANT_EXPORT_SIGNING_KEY_ID': 'export-certification-key-v1',
    'TENANT_EXPORT_POLL_INTERVAL_SECONDS': '1',
    'TENANT_EXPORT_BATCH_SIZE': '1',
    'TENANT_EXPORT_CLAIM_TIMEOUT_SECONDS': '5',
    'TENANT_EXPORT_MAX_ATTEMPTS': '2',
    'TENANT_EXPORT_RETRY_BASE_SECONDS': '1',
    'TENANT_EXPORT_RETRY_MAX_SECONDS': '2',
    'TENANT_EXPORT_EXPIRY_HOURS': '1',
})

try:
    run('tenant-export-initdb', ['initdb', '-D', str(BASE / 'pg'), '--auth=trust', '--username=postgres'], env, ROOT)
    postgres_process = start_process(
        ['postgres', '-D', str(BASE / 'pg'), '-h', '127.0.0.1', '-p', str(pg_port)],
        env,
        ROOT,
    )
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        if postgres_process.poll() is not None:
            raise RuntimeError('Disposable PostgreSQL exited before becoming ready')
        if subprocess.run(['pg_isready', '-h', '127.0.0.1', '-p', str(pg_port)], capture_output=True).returncode == 0:
            break
        time.sleep(0.2)
    else:
        raise RuntimeError('Disposable PostgreSQL did not become ready')
    run('tenant-export-createdb', ['createdb', '-h', '127.0.0.1', '-p', str(pg_port), '-U', 'postgres', NAME], env, ROOT)
    key = subprocess.run(
        ['openssl', 'genpkey', '-algorithm', 'ED25519', '-outform', 'DER'],
        capture_output=True,
        check=True,
    ).stdout
    env['TENANT_EXPORT_SIGNING_PRIVATE_KEY_BASE64'] = base64.b64encode(key).decode()
    run(
        'tenant-export-migrations',
        ['pnpm', '--config.verify-deps-before-run=false', '--dir', 'packages/db', 'exec', 'prisma', 'migrate', 'deploy', '--config', 'prisma.config.ts'],
        env,
        ROOT,
    )
    volume_image = BASE / 'minio-cert.sparseimage'
    volume_mount = BASE / 'minio-volume'
    volume_mount.mkdir()
    subprocess.run(
        ['hdiutil', 'create', '-quiet', '-size', '4g', '-fs', 'APFS', '-volname', 'GigaExportCert', '-type', 'SPARSE', str(volume_image)],
        check=True,
        capture_output=True,
    )
    subprocess.run(
        ['hdiutil', 'attach', '-quiet', '-nobrowse', '-mountpoint', str(volume_mount), str(volume_image)],
        check=True,
        capture_output=True,
    )
    VOLUME_ATTACHED = True
    start(
        'tenant-export-minio',
        ['minio', 'server', '--quiet', '--address', f'127.0.0.1:{minio_port}', '--console-address', f'127.0.0.1:{console_port}', str(volume_mount / 'data')],
        {**env, 'MINIO_ROOT_USER': env['STORAGE_ACCESS_KEY'], 'MINIO_ROOT_PASSWORD': env['STORAGE_SECRET_KEY']},
        ROOT,
        f'http://127.0.0.1:{minio_port}/minio/health/live',
    )
    start(
        'tenant-export-api',
        ['node', str(ROOT / 'apps/playground-api/dist/main.js')],
        env,
        ROOT,
        f'http://127.0.0.1:{api_port}/api/v1/ready',
    )
    run('tenant-export-outcome', ['node', str(OUT / 'verify-tenant-export.mjs')], env, ROOT)
finally:
    for process in reversed(PROCESSES):
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=8)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=3)
    for log in LOGS:
        log.close()
    if VOLUME_ATTACHED:
        subprocess.run(['hdiutil', 'detach', '-quiet', str(BASE / 'minio-volume')], check=False)
    WORK.cleanup()
    passed = bool(RESULTS) and all(item['exitCode'] == 0 for item in RESULTS)
    (OUT / 'tenant-export-certification.json').write_text(json.dumps({
        'source': 'Isolated, attributable records created through authenticated real APIs',
        'services': 'Disposable PostgreSQL 14 and MinIO S3-compatible object storage',
        'checks': RESULTS,
        'cleanup': {'postgresDataRemoved': True, 'objectDataRemoved': True},
        'passed': passed,
    }, indent=2) + '\n')
