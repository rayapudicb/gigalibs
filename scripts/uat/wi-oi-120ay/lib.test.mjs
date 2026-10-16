// node --test scripts/uat/wi-oi-120ay/lib.test.mjs
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  REASON,
  checkedEmail,
  issueSql,
  issuedSql,
  newId,
  newToken,
  resetLink,
  targetSql,
  tokenDigest,
  usedSql,
} from './lib.mjs';

test('the token digest is the one the product looks the credential up by', () => {
  const { token, digest } = newToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  // packages/auth-nest/src/auth.service.ts resetPassword: createHash('sha256').update(dto.token, 'utf8').digest('hex')
  assert.equal(digest, createHash('sha256').update(token, 'utf8').digest('hex'));
  assert.equal(
    tokenDigest('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
  assert.notEqual(newToken().token, token);
});

test('row ids have the shape of the product rows', () => {
  const id = newId();
  assert.match(id, /^c[0-9a-z]{24}$/);
  assert.notEqual(newId(), id);
});

test('only a plain address reaches the SQL', () => {
  assert.equal(checkedEmail(' NewUser@GigaLibs.io '), 'newuser@gigalibs.io');
  for (const bad of [
    "x'@y.io",
    'x@y',
    'x y@z.io',
    '',
    undefined,
    "a@b.io'; DROP TABLE users; --",
  ]) {
    assert.equal(checkedEmail(bad), null);
  }
  assert.throws(() => targetSql("x'@y.io"), /not a plain email/);
});

test('issues one credential for one active platform owner, or raises and writes nothing', () => {
  const sql = issueSql({
    email: 'newuser@gigalibs.io',
    digest: 'a'.repeat(64),
    credentialId: newId(),
    auditId: newId(),
  });
  assert.match(sql, /^DO \$\$/);
  assert.match(sql, /lower\(u\.email\) = 'newuser@gigalibs\.io' AND u\.status = 'ACTIVE'/);
  assert.match(sql, /p\.role = 'PLATFORM_OWNER' AND p\.status = 'ACTIVE'/);
  assert.match(sql, /IF found <> 1 THEN\s+RAISE EXCEPTION/);
  assert.match(sql, /UPDATE public\.password_reset_credentials SET "usedAt" = now\(\)/);
  assert.match(sql, /interval '30 minutes'/);
  assert.match(sql, /'ASSISTED_RESET_ISSUED'/);
  assert.match(sql, /'delivery', 'OWNER_RUN_CONSOLE'/);
  assert.ok(sql.includes(`'${REASON}'`));
  assert.doesNotMatch(sql, /passwordHash|DELETE/);
  assert.throws(
    () =>
      issueSql({
        email: 'newuser@gigalibs.io',
        digest: 'xyz',
        credentialId: newId(),
        auditId: newId(),
      }),
    /SHA-256/,
  );
  assert.throws(
    () =>
      issueSql({
        email: 'newuser@gigalibs.io',
        digest: 'a'.repeat(64),
        credentialId: "c'",
        auditId: newId(),
      }),
    /row id/,
  );
});

test('the read-backs check the issued credential, then its use by the product', () => {
  const credentialId = newId();
  const issued = issuedSql({ email: 'newuser@gigalibs.io', credentialId });
  assert.match(issued, /'credential open for the login', 1/);
  assert.match(issued, /'other open credentials of the login', 0/);
  assert.match(issued, /'issue audited', 1/);
  const used = usedSql('newuser@gigalibs.io');
  assert.match(used, /'credential used', 1/);
  assert.match(used, /'ASSISTED_RESET_CONSUMED'/);
});

test('the link opens the product reset page with the token encoded', () => {
  assert.equal(
    resetLink('http://127.0.0.1:5180', 'a+b/c'),
    'http://127.0.0.1:5180/reset-password?token=a%2Bb%2Fc',
  );
});
