import base64
import json
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BASE = 'http://127.0.0.1:5180'
results = []

def probe(label, path, body=None):
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Content-Type': 'application/json', 'X-Correlation-Id': 'gigalibs-audit-20260909'})
    try:
        response = urllib.request.urlopen(req, timeout=25)
    except urllib.error.HTTPError as err:
        response = err
    except Exception as err:
        results.append({'label': label, 'path': path, 'error_type': type(err).__name__, 'error': str(err)})
        return
    raw = response.read()
    item = {'label': label, 'path': path, 'status': response.status, 'authenticated_request': False}
    try:
        data = json.loads(raw)
        if isinstance(data, dict):
            item['response_keys'] = sorted(data.keys())
            item['selected_response'] = {k: data[k] for k in ['authenticated', 'role', 'status', 'success', 'requiresTenantSelection'] if k in data}
            if isinstance(data.get('items'), list):
                item['item_count'] = len(data['items'])
            if label == 'fabricated-action':
                item['impactMetrics'] = data.get('impactMetrics')
                item['audit_digest_present'] = bool(data.get('auditDigest'))
        else:
            item['json_type'] = type(data).__name__
    except Exception:
        item['content_type'] = response.headers.get('Content-Type')
    cookie_headers = response.headers.get_all('Set-Cookie') or []
    item['session_cookie_count'] = len(cookie_headers)
    # Decode only role/tenant-presence metadata; never store tokens, credentials, or records.
    for cookie in cookie_headers:
        val = cookie.split(';', 1)[0].split('=', 1)[-1]
        parts = val.split('.')
        if len(parts) == 3:
            try:
                payload = json.loads(base64.urlsafe_b64decode(parts[1] + '=' * (-len(parts[1]) % 4)))
                item['issued_token_role'] = payload.get('role')
                item['issued_token_has_tenant'] = bool(payload.get('tid'))
            except Exception:
                pass
    results.append(item)

# Read-only request; response records are neither stored nor displayed.
probe('unauthenticated-invoices', '/api/ar/v1/invoices')
# Auth negative probe uses a nonexistent reserved-domain identity and keeps no cookie jar.
probe('invalid-login', '/api/auth/login', {'email': 'gigalibs-audit-20260909@example.invalid', 'password': 'invalid-audit-20260909'})
# Source-inspected handler contains no persistence/provider calls; this exercises its false response only.
probe('fabricated-action', '/api/analytics/action', {'tenantId': 'defense', 'actionType': 'HOLD_PAYMENT_DISPUTE', 'entityCode': 'AUDIT-NONEXISTENT-20260909'})
out = {'observed_at_utc': datetime.now(timezone.utc).isoformat(), 'base_url': BASE, 'results': results,
       'scope': 'Local HTTP probes only. No browser UAT, provider execution, or database persistence certification.'}
Path('/private/tmp/gigalibs-readiness-2026-09-09/local-probes.json').write_text(json.dumps(out, indent=2) + '\n')
print(json.dumps(out, indent=2))
