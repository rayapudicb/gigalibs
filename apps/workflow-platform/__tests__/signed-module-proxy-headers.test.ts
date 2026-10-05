import { describe, expect, it } from 'vitest';
import { forwardedWriteHeaders } from '../lib/signed-module-proxy';

// WI-OI-120c (audit P1-23): module writes keep their retry key and the version they were made against.
const request = (headers: Record<string, string>) => ({ headers: new Headers(headers) });

describe('signed module proxy write headers', () => {
  it('forwards a UUID Idempotency-Key and an If-Match entity tag or version', () => {
    const key = '3f2c8a3e-6b1d-4c2a-9f4e-1a2b3c4d5e6f';
    expect(forwardedWriteHeaders(request({ 'Idempotency-Key': key, 'If-Match': '"v7"' }))).toEqual({
      ok: true,
      headers: { 'Idempotency-Key': key, 'If-Match': '"v7"' },
    });
    expect(forwardedWriteHeaders(request({ 'If-Match': 'W/"abc-1"' }))).toEqual({
      ok: true,
      headers: { 'If-Match': 'W/"abc-1"' },
    });
    expect(forwardedWriteHeaders(request({ 'If-Match': '12' }))).toEqual({ ok: true, headers: { 'If-Match': '12' } });
  });

  it('forwards nothing when the caller sends neither header', () => {
    expect(forwardedWriteHeaders(request({}))).toEqual({ ok: true, headers: {} });
  });

  it.each(['not-a-uuid', '3f2c8a3e6b1d4c2a9f4e1a2b3c4d5e6f', '3f2c8a3e-6b1d-0c2a-9f4e-1a2b3c4d5e6f', ''])(
    'refuses a malformed Idempotency-Key %j',
    (value) => {
      expect(forwardedWriteHeaders(request({ 'Idempotency-Key': value }))).toMatchObject({
        ok: false,
        code: 'IDEMPOTENCY_KEY_INVALID',
      });
    },
  );

  it.each(['v7', '"unterminated', '"has"quote"', `"${'x'.repeat(129)}"`, '-1'])(
    'refuses a malformed If-Match %j',
    (value) => {
      expect(forwardedWriteHeaders(request({ 'If-Match': value }))).toMatchObject({
        ok: false,
        code: 'IF_MATCH_INVALID',
      });
    },
  );
});
