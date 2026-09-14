"""WI-OI-013 real HTTP negative checks against an isolated, unconfigured Next server.

Run only on loopback port 5199 with CONTROL_PLANE_API_URL and EXECUTION_PLANE_API_URL
explicitly empty, BFF_MAX_REQUEST_BYTES=4096. No mocked HTTP responses or DB records.
No business/provider success is attempted or certified.
"""
import json
import re
import urllib.error
import urllib.request
from pathlib import Path

BASE = 'http://127.0.0.1:5199'
OUT = Path(__file__).parent
MANIFEST = OUT.parent.parent / 'iam-containment-manifest.json'


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


opener = urllib.request.build_opener(NoRedirect)
results = []
completed = False


def check(path, method='GET', expected=(401,), body=None, cookie=None):
    headers = {'Accept': 'application/json'}
    if body is not None:
        headers['Content-Type'] = 'application/json'
    if cookie:
        headers['Cookie'] = cookie
    raw = body.encode() if isinstance(body, str) else json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(BASE + path, data=raw, headers=headers, method=method)
    try:
        response = opener.open(request, timeout=30)
    except urllib.error.HTTPError as error:
        response = error
    payload = response.read()
    status = response.status
    row = {'path': path, 'method': method, 'status': status, 'expected': list(expected),
           'passed': status in expected, 'setsAccessCookie': any(
               'gigalibs_access_token=' in h for h in response.headers.get_all('Set-Cookie', []))}
    if path.startswith('/api/') and method != 'HEAD':
        try:
            parsed = json.loads(payload)
            row['claimsSuccess'] = parsed.get('authenticated') is True or parsed.get('success') is True
            row['passed'] = row['passed'] and not row['claimsSuccess']
        except (ValueError, AttributeError):
            row['passed'] = False
    row['passed'] = row['passed'] and not row['setsAccessCookie']
    results.append(row)
    if not row['passed']:
        raise AssertionError(json.dumps(row))


try:
    # First verify the deliberately unconfigured identity boundary before any other POST.
    check('/api/auth/login', 'POST', (503,), {'email': 'iam-http@example.invalid', 'password': 'isolated-negative-password'})
    check('/api/auth/register', 'POST', (503,), {'email': 'iam-http@example.invalid', 'password': 'isolated-negative-password', 'name': 'Isolated negative check'})
    check('/api/auth/login', 'POST', (400,), '{')
    check('/api/auth/register', 'POST', (400,), {'email': 'iam-http@example.invalid', 'password': 'short', 'name': 'Isolated check'})
    check('/api/auth/login', 'POST', (413,), 'x' * 4097)
    for entry in json.loads(MANIFEST.read_text())['entries']:
        if entry['kind'] != 'api':
            continue
        path = '/api/' + entry['file'].split('/app/api/', 1)[1].removesuffix('/route.ts')
        path = re.sub(r'\[[^]]+\]', 'IAM-NONEXISTENT', path)
        for method in entry['methods']:
            check(path, method, body={'entityCode': 'IAM-NONEXISTENT'} if method not in ('GET', 'HEAD') else None)
        if 'GET' in entry['methods']:
            check(path, 'HEAD')
    check('/api/analytics/action', 'POST', (503,), {'entityCode': 'IAM-NONEXISTENT'}, 'gigalibs_access_token=invalid-audit-token; wf_role=SUPER_ADMIN; wf_tenant=untrusted')
    for path in ['/api/auth/context', '/api/control/ap/invoices', '/api/workflows', '/api/runs', '/api/operational-intelligence/environments']:
        check(path)
    for path in ['/dashboard', '/ar', '/ar/invoices/IAM-NONEXISTENT', '/cmms/requests/portal', '/tax', '/settings/profile']:
        check(path, expected=(307, 303))
    completed = True
finally:
    report = {'kind': 'real Next.js HTTP negative verification', 'base': BASE,
              'controlPlane': 'deliberately unconfigured', 'businessWritesAttempted': False,
              'databaseVerification': 'not performed', 'scope': 'denial and unavailability only; no DB E2E certification',
              'passed': completed and all(r['passed'] for r in results), 'checks': results}
    (OUT / 'http-negative-results.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'checks': len(results), 'passed': report['passed']}))
