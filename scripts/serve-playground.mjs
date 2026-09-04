import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PORT = 5180;
const DIST_DIR = path.resolve('apps/playground-web/dist');
const DATA_FILE = path.resolve('data/runtime-store.json');

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function getStore() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error reading store:', e);
  }
  return { tenants: [], users: [], settings: { version: 1 } };
}

function saveStore(store) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
  } catch (e) {
    console.error('Error saving store:', e);
  }
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Tenant-ID');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // ─── API ROUTER (/api/v1/*) ────────────────────────────────────────────────
  if (pathname.startsWith('/api/v1')) {
    const apiPath = pathname.replace('/api/v1', '');
    res.setHeader('Content-Type', 'application/json');

    const readBody = () => new Promise((resolve) => {
      let data = '';
      req.on('data', chunk => { data += chunk; });
      req.on('end', () => {
        try { resolve(data ? JSON.parse(data) : {}); }
        catch { resolve({}); }
      });
    });

    const store = getStore();

    // GET /api/v1/tenants
    if (apiPath === '/tenants' && req.method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify(store.tenants || []));
      return;
    }

    // POST /api/v1/tenants
    if (apiPath === '/tenants' && req.method === 'POST') {
      const body = await readBody();
      const slug = (body.slug || body.name || 'tenant').toLowerCase().replace(/[^a-z0-9-]/g, '');
      const newTenant = {
        id: `ten_${slug}_${Date.now().toString(36)}`,
        name: body.name || 'New Organization',
        slug,
        status: 'ACTIVE',
        isolationMode: body.isolationMode || 'ROW_LEVEL_SECURITY',
        region: body.region || 'US-East (N. Virginia)',
        customDomain: `${slug}.localhost:5180`,
        plan: body.plan || 'ENTERPRISE',
        provisionedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      store.tenants = [newTenant, ...(store.tenants || [])];
      saveStore(store);
      res.writeHead(201);
      res.end(JSON.stringify(newTenant));
      return;
    }

    // PATCH /api/v1/tenants/current/status
    if (apiPath === '/tenants/current/status' && req.method === 'PATCH') {
      const body = await readBody();
      const tenantId = req.headers['x-tenant-id'];
      const target = store.tenants.find(t => t.id === tenantId);
      if (target) {
        target.status = body.status || target.status;
        target.updatedAt = new Date().toISOString();
        saveStore(store);
        res.writeHead(200);
        res.end(JSON.stringify(target));
        return;
      }
    }

    // POST /api/v1/auth/login or register
    if (apiPath.startsWith('/auth/login') || apiPath.startsWith('/auth/register')) {
      const body = await readBody();
      const email = body.email || 'admin@gigalibs.dev';
      const name = body.name || email.split('@')[0];
      const existingUser = (store.users || []).find(u => u.email === email);
      if (!existingUser) {
        store.users = [{ id: `usr_${Date.now().toString(36)}`, email, name, role: 'TENANT_ADMIN' }, ...(store.users || [])];
        saveStore(store);
      }
      res.writeHead(200);
      res.end(JSON.stringify({
        accessToken: `mock_jwt_access_${Date.now()}`,
        refreshToken: `mock_jwt_refresh_${Date.now()}`,
        expiresIn: 86400,
        tokenType: 'Bearer',
        user: { email, name },
      }));
      return;
    }

    // GET /api/v1/settings
    if (apiPath === '/settings' && req.method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify(store.settings || { version: 1 }));
      return;
    }

    // PATCH /api/v1/settings
    if (apiPath === '/settings' && req.method === 'PATCH') {
      const body = await readBody();
      store.settings = {
        ...(store.settings || {}),
        ...body,
        version: ((store.settings?.version || 1) + 1),
      };
      saveStore(store);
      res.writeHead(200);
      res.end(JSON.stringify(store.settings));
      return;
    }

    // GET /api/v1/modules
    if (apiPath === '/modules' && req.method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify([
        { manifest: { id: 'auth-core', name: 'Identity & Authentication', version: '1.0.0', description: 'Multi-tenant auth guard', capabilities: ['SESSION_ROTATION', 'MFA'], requires: {}, permissions: [], healthChecks: [] }, status: 'READY', problems: [] },
        { manifest: { id: 'rbac-core', name: 'Role-Based Access Control', version: '1.0.0', description: 'ABAC & Scope gates', capabilities: ['RESOURCE_SCOPES', 'ROLE_MATRIX'], requires: {}, permissions: [], healthChecks: [] }, status: 'READY', problems: [] },
        { manifest: { id: 'tenancy-core', name: 'Tenant Isolation Engine', version: '1.0.0', description: 'Domain resolver & schema router', capabilities: ['SCHEMA_ISOLATION', 'RLS'], requires: {}, permissions: [], healthChecks: [] }, status: 'READY', problems: [] },
        { manifest: { id: 'sam-gov-gateway', name: 'SAM.gov Federal Procurement', version: '1.0.0', description: 'GSA API & Debarment screening', capabilities: ['FEDERAL_RFPS', 'FAR_COMPLIANCE'], requires: {}, permissions: [], healthChecks: [] }, status: 'READY', problems: [] },
        { manifest: { id: 'ledger-core', name: 'Double-Entry General Ledger', version: '1.0.0', description: 'GAAP/IFRS balanced ledger', capabilities: ['DEBITS_EQUAL_CREDITS'], requires: {}, permissions: [], healthChecks: [] }, status: 'READY', problems: [] },
      ]));
      return;
    }

    // Fallback for unhandled API endpoints
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // ─── STATIC ASSET & SPA ROUTING ───────────────────────────────────────────
  let filePath = path.join(DIST_DIR, pathname);

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST_DIR, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`⚡ GigaLibs Enterprise 21+ Studio Platform live with Persisted API at http://localhost:${PORT}`);
});
