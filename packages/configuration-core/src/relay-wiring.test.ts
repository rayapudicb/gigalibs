import { describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain ES module shared with scripts/verify-relay-wiring.mjs
import { checkRelayWiring } from '../../../scripts/lib/relay-wiring.mjs';

// WI-OI-160 (ADR-0039 §5): a relay is set on the services it names, and no relay key sits on a service no relay names.
const relay = {
  key: 'parties-to-business-partners',
  from: 'core',
  to: 'business-partners',
  status: 'wired',
  producer: { service: 'api', url: 'BP_RELAY_URL', signingKey: 'BP_INBOX_RELAY_PRIVATE_KEY_BASE64' },
  consumer: { service: 'module-host', publicKeys: ['BP_INBOX_RELAY_PUBLIC_KEY_BASE64'] },
};
const code = new Set(['BP_RELAY_URL', 'BP_INBOX_RELAY_PRIVATE_KEY_BASE64', 'BP_INBOX_RELAY_PUBLIC_KEY_BASE64']);
const codes = (result: { violations: Array<[string, string]> }) => result.violations.map(([code]) => code);

describe('relay wiring', () => {
  it('passes a relay set on the services it names', () => {
    const result = checkRelayWiring(
      { relays: [relay] },
      { api: ['BP_RELAY_URL', 'BP_INBOX_RELAY_PRIVATE_KEY_BASE64'], 'module-host': ['BP_INBOX_RELAY_PUBLIC_KEY_BASE64'] },
      code,
    );
    expect(result.violations).toEqual([]);
    expect(result.wired).toEqual(['parties-to-business-partners']);
  });

  it('fails the QA-046 case: the relay keys on a service that does not send', () => {
    const result = checkRelayWiring(
      { relays: [relay] },
      {
        api: [],
        'kernel-worker': ['BP_RELAY_URL', 'BP_INBOX_RELAY_PRIVATE_KEY_BASE64'],
        'module-host': ['BP_INBOX_RELAY_PUBLIC_KEY_BASE64'],
      },
      code,
    );
    expect(codes(result)).toEqual(['RELAY_NOT_ON_SERVICE', 'RELAY_NOT_ON_SERVICE', 'RELAY_STRAY', 'RELAY_STRAY']);
  });

  it('fails a name no code reads, and lists a not-wired relay only with its reason', () => {
    const typo = { ...relay, producer: { ...relay.producer, url: 'BP_RELAY_ULR' } };
    expect(codes(checkRelayWiring({ relays: [typo] }, { api: ['BP_RELAY_ULR', 'BP_INBOX_RELAY_PRIVATE_KEY_BASE64'], 'module-host': ['BP_INBOX_RELAY_PUBLIC_KEY_BASE64'] }, code))).toEqual([
      'RELAY_NAME_UNKNOWN',
    ]);
    const pending = { ...relay, status: 'not-wired', reason: 'Keys are the owner\'s to generate.' };
    const result = checkRelayWiring({ relays: [pending] }, { api: [], 'module-host': [] }, code);
    expect(result.violations).toEqual([]);
    expect(result.notWired).toEqual([{ key: 'parties-to-business-partners', reason: "Keys are the owner's to generate." }]);
    expect(codes(checkRelayWiring({ relays: [{ ...pending, reason: '' }] }, {}, code))).toEqual(['RELAY_REASON']);
  });
});
