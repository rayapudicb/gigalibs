// WI-OI-120am: UAT gets its own database. Pure functions only; prepare.mjs and cutover.mjs do the I/O.
// Nothing here prints or returns a secret except inside the text it is asked to write.

export const CARD = 'WI-OI-120am';
export const NEW_HOST = 'uat-postgres';
export const NEW_PORT = 5432;
export const OLD_ENDPOINT = 'host.docker.internal:5440';
export const BOOTSTRAP_ROLE = 'gigalibs';
/**
 * Owner decision D2a: the test role does not survive in the new database. The backup grants it rights (all on schema
 * gigalibs_finance, 336 table grants; it owns nothing), so a strict restore needs it to exist: it is created NOLOGIN for
 * the restore and dropped right after (dropSkippedRolesSql).
 */
export const SKIPPED_ROLES = Object.freeze(['rls_test_user']);
const DATABASE_URL_LINE = /^((?:[A-Z][A-Z0-9_]*_)?DATABASE_URL)=(postgres(?:ql)?):\/\/([^:@/]+)(?::[^@]*)?@([^/?#]+)(\/[^\s]*)$/;
const ROLE_NAME = /^[a-z][a-z0-9_]*$/;

const quoteIdent = (name) => {
  if (!ROLE_NAME.test(name)) throw new Error(`${CARD}: unexpected role name ${JSON.stringify(name)}`);
  return `"${name}"`;
};
const quoteLiteral = (value) => `'${String(value).replace(/'/g, "''")}'`;

/** The database URLs in an env file: variable, user and host:port. Never the password. */
export function databaseUrls(text) {
  return text.split('\n').flatMap((line) => {
    const match = line.match(DATABASE_URL_LINE);
    return match ? [{ name: match[1], user: decodeURIComponent(match[3]), endpoint: match[4] }] : [];
  });
}

/**
 * The env text with every database URL that names the old endpoint moved to `uat-postgres:5432` with its user's new
 * password, and CONTROL_POSTGRES_CONTAINER set to the new container. Every other line is kept byte for byte.
 */
export function rewriteEnv(text, { passwords, container }) {
  const changed = [];
  const lines = text.split('\n').map((line) => {
    const match = line.match(DATABASE_URL_LINE);
    if (match) {
      const [, name, scheme, rawUser, endpoint, rest] = match;
      if (endpoint !== OLD_ENDPOINT) throw new Error(`${CARD}: ${name} names ${endpoint}, not the old database`);
      const user = decodeURIComponent(rawUser);
      const password = passwords[user];
      if (!password) throw new Error(`${CARD}: no new password for ${user} (${name})`);
      if (!/^[A-Za-z0-9]+$/.test(password)) throw new Error(`${CARD}: passwords must be URL-safe`);
      changed.push(name);
      return `${name}=${scheme}://${rawUser}:${password}@${NEW_HOST}:${NEW_PORT}${rest}`;
    }
    if (/^CONTROL_POSTGRES_CONTAINER=/.test(line)) {
      changed.push('CONTROL_POSTGRES_CONTAINER');
      return `CONTROL_POSTGRES_CONTAINER=${container}`;
    }
    return line;
  });
  const out = lines.join('\n');
  if (out.includes(OLD_ENDPOINT.replace(':5440', ':5440/')) || /@host\.docker\.internal:5440\//.test(out)) {
    throw new Error(`${CARD}: a database URL still names the old endpoint`);
  }
  return { text: out, changed };
}

/**
 * SQL that recreates the old cluster's roles (attributes, memberships, database connect grants) in the new one, with
 * new passwords for roles that log in. The bootstrap superuser already exists (POSTGRES_USER); the skipped roles are
 * not created. Refuses a second superuser.
 */
export function rolesSql({ roles, memberships, connectGrants }, passwords) {
  const out = [
    `-- ${CARD}: roles for the new UAT database. Contains passwords: mode 600, deleted by the cutover once it succeeds.`,
    // Security review L1: a failing statement must never reach the server log with its password.
    'SET log_min_error_statement = panic;',
    'SET log_statement = none;',
  ];
  const names = new Set();
  for (const role of roles) {
    if (role.rolname.startsWith('pg_')) continue;
    if (SKIPPED_ROLES.includes(role.rolname)) {
      out.push(`CREATE ROLE ${quoteIdent(role.rolname)} WITH NOSUPERUSER NOLOGIN NOINHERIT NOCREATEROLE NOCREATEDB NOREPLICATION NOBYPASSRLS; -- for the restore's grants only; dropped after it`);
      continue;
    }
    names.add(role.rolname);
    if (role.rolname === BOOTSTRAP_ROLE) continue;
    if (role.rolsuper) throw new Error(`${CARD}: ${role.rolname} is a superuser; only ${BOOTSTRAP_ROLE} may be`);
    const attributes = [
      'NOSUPERUSER',
      role.rolcanlogin ? 'LOGIN' : 'NOLOGIN',
      role.rolinherit ? 'INHERIT' : 'NOINHERIT',
      role.rolcreaterole ? 'CREATEROLE' : 'NOCREATEROLE',
      role.rolcreatedb ? 'CREATEDB' : 'NOCREATEDB',
      role.rolreplication ? 'REPLICATION' : 'NOREPLICATION',
      role.rolbypassrls ? 'BYPASSRLS' : 'NOBYPASSRLS',
    ];
    if (role.rolcanlogin) {
      const password = passwords[role.rolname];
      if (!password) throw new Error(`${CARD}: no new password for login role ${role.rolname}`);
      attributes.push(`PASSWORD ${quoteLiteral(password)}`);
    }
    out.push(`CREATE ROLE ${quoteIdent(role.rolname)} WITH ${attributes.join(' ')};`);
  }
  for (const m of memberships) {
    if (!names.has(m.role) || !names.has(m.member)) continue;
    out.push(`GRANT ${quoteIdent(m.role)} TO ${quoteIdent(m.member)}${m.admin_option ? ' WITH ADMIN OPTION' : ''};`);
  }
  for (const role of connectGrants) {
    if (names.has(role) && role !== BOOTSTRAP_ROLE) out.push(`GRANT CONNECT ON DATABASE "gigalibs" TO ${quoteIdent(role)};`);
  }
  return `${out.join('\n')}\n`;
}

/**
 * After the restore: SQL that removes the skipped roles. It refuses (raises) if one owns anything, because DROP OWNED
 * would then delete objects; with nothing owned, DROP OWNED only revokes the role's grants.
 */
export function dropSkippedRolesSql() {
  // Security review L2: pg_shdepend 'o' covers every kind of owned object in every database of the cluster.
  return SKIPPED_ROLES.map((name) => `DO $drop$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_shdepend d JOIN pg_roles r ON r.oid = d.refobjid
              WHERE d.refclassid = 'pg_authid'::regclass AND d.deptype = 'o' AND r.rolname = ${quoteLiteral(name)}) THEN
    RAISE EXCEPTION '${CARD}: ${name} owns objects; the owner decides before it is dropped';
  END IF;
END
$drop$;
DROP OWNED BY ${quoteIdent(name)};
DROP ROLE ${quoteIdent(name)};`).join('\n');
}

/**
 * Security review L4: what the role copy would lose. Each entry is a reason to stop before the cutover.
 * `facts`: rows from the old cluster (see prepare.mjs).
 */
export function lossyRoleFeatures({ systemMemberships, limitedRoles, datacl }) {
  const problems = [];
  for (const m of systemMemberships) problems.push(`${m.member} is a member of ${m.role}`);
  for (const r of limitedRoles) problems.push(`${r.rolname} has a connection limit or an expiry`);
  const entries = (datacl ?? '').replace(/^\{|\}$/g, '').split(',').filter(Boolean);
  const publicEntry = entries.find((e) => e.startsWith('='));
  if (publicEntry && publicEntry.split('=')[1].split('/')[0] !== 'Tc') problems.push(`PUBLIC holds ${publicEntry} on the database, not the default Tc`);
  for (const e of entries) {
    const [grantee, rest = ''] = e.split('=');
    const rights = rest.split('/')[0];
    if (grantee && grantee !== BOOTSTRAP_ROLE && rights !== 'c') problems.push(`${grantee} holds ${rights} on the database (only CONNECT is copied)`);
  }
  return problems;
}

/** The roles named in a database ACL (`{=Tc/x,role=c/x}`) that hold CONNECT. */
export function connectGrantees(datacl) {
  if (!datacl) return [];
  return datacl.replace(/^\{|\}$/g, '').split(',').flatMap((entry) => {
    const [grantee, rest = ''] = entry.split('=');
    return grantee && rest.split('/')[0].includes('c') ? [grantee] : [];
  });
}

/**
 * Read-only SQL: every table's exact row count, and a content digest of every migration ledger, one line each:
 * `count|schema.table|n` and `ledger|schema.table|md5`. Compared between the old and the new database.
 */
export const INVENTORY_SQL = `
SELECT 'count|' || table_schema || '.' || table_name || '|' ||
       (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', table_schema, table_name), false, true, '')))[1]::text
  FROM information_schema.tables
 WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ('pg_catalog', 'information_schema')
 ORDER BY 1;
SELECT 'catalog|sequences|' || md5(coalesce(string_agg(schemaname || '.' || sequencename || '=' || coalesce(last_value::text, '-'), ',' ORDER BY schemaname, sequencename), '')) FROM pg_sequences;
SELECT 'catalog|policies|' || md5(coalesce(string_agg(schemaname || '.' || tablename || '.' || policyname || ':' || cmd || ':' || coalesce(qual, '') || ':' || coalesce(with_check, ''), ',' ORDER BY schemaname, tablename, policyname), '')) FROM pg_policies;
SELECT 'catalog|row-security|' || count(*) FILTER (WHERE relrowsecurity) || '/' || count(*) FILTER (WHERE relforcerowsecurity) FROM pg_class WHERE relkind IN ('r', 'p');
SELECT 'catalog|large-objects|' || count(*) FROM pg_largeobject_metadata;
SELECT 'catalog|extensions|' || string_agg(extname || ' ' || extversion, ',' ORDER BY extname) FROM pg_extension;
SELECT 'ledger|' || table_schema || '.' || table_name || '|' ||
       (xpath('/row/h/text()', query_to_xml(format('SELECT md5(coalesce(string_agg(t::text, %L ORDER BY t::text), %L)) AS h FROM %I.%I t', '|', '', table_schema, table_name), false, true, '')))[1]::text
  FROM information_schema.tables
 WHERE table_type = 'BASE TABLE' AND table_name IN ('schema_migrations', '_prisma_migrations')
 ORDER BY 1;
`;

/** Differences between two inventories (lines from INVENTORY_SQL). Empty means equal. */
export function compareInventories(oldText, newText) {
  const toMap = (text) => new Map(text.trim().split('\n').filter(Boolean).map((line) => {
    const at = line.lastIndexOf('|');
    return [line.slice(0, at), line.slice(at + 1)];
  }));
  const a = toMap(oldText);
  const b = toMap(newText);
  const differences = [];
  for (const [key, value] of a) if (b.get(key) !== value) differences.push(`${key}: ${value} → ${b.get(key) ?? 'missing'}`);
  for (const key of b.keys()) if (!a.has(key)) differences.push(`${key}: only in the new database`);
  return {
    differences,
    tables: [...a.keys()].filter((k) => k.startsWith('count|')).length,
    ledgers: [...a.keys()].filter((k) => k.startsWith('ledger|')).length,
    catalogChecks: [...a.keys()].filter((k) => k.startsWith('catalog|')).length,
  };
}

/**
 * Card condition C6: SQL that gives every login role of the old (now development-only) cluster a new password. Never
 * logs a failing statement (it would carry the password).
 */
export function rotateSql(loginRoles, passwords) {
  const lines = ['SET log_min_error_statement = panic;', 'SET log_statement = none;'];
  for (const name of loginRoles) {
    const password = passwords[name];
    if (!password) throw new Error(`${CARD}: no new password for ${name}`);
    lines.push(`ALTER ROLE ${quoteIdent(name)} WITH PASSWORD ${quoteLiteral(password)};`);
  }
  return `${lines.join('\n')}\n`;
}

