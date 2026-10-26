import { describe, expect, it } from 'vitest';
import {
  type CreatedInvite,
  inviteAcceptUrl,
  inviteLinksText,
  parsePeopleList,
} from '../lib/people-admin-parse';

// WI-OI-120p (S17): the pasted-list parser that feeds the bulk invite. Lenient on purpose — the control plane does the
// real validation — so this only structures the paste and flags lines the person can fix before sending.
describe('parsePeopleList', () => {
  it('reads one email per line, lower-cases it, and takes an optional name from a second column', () => {
    const result = parsePeopleList(
      'Ada@North.example\nGrace Hopper, grace@north.example\nalan@north.example\tAlan T',
    );
    expect(result.people).toEqual([
      { email: 'ada@north.example' },
      // The row is "name, email"? No — first column is the email; a non-email first cell is an invalid line.
      { email: 'alan@north.example', name: 'Alan T' },
    ]);
    // "Grace Hopper, grace@north.example" has a non-email first cell, so it is flagged, not silently mis-read.
    expect(result.invalidLines).toEqual([2]);
  });

  it('takes "email, name" order (email first, then name)', () => {
    const result = parsePeopleList(
      'ada@north.example, Ada Lovelace\nalan@north.example,Alan Turing',
    );
    expect(result.people).toEqual([
      { email: 'ada@north.example', name: 'Ada Lovelace' },
      { email: 'alan@north.example', name: 'Alan Turing' },
    ]);
    expect(result.invalidLines).toEqual([]);
  });

  it('skips a leading header row, blank lines, and collapses duplicate emails', () => {
    const result = parsePeopleList(
      'email, name\n\nada@north.example\nADA@north.example\n  \nbob@north.example',
    );
    expect(result.people.map((p) => p.email)).toEqual(['ada@north.example', 'bob@north.example']);
    expect(result.duplicates).toBe(1);
    expect(result.invalidLines).toEqual([]);
  });

  it('flags lines that hold text but no usable email, by 1-based line number', () => {
    const result = parsePeopleList(
      'ada@north.example\nnot-an-email\nmissing@domain\nbob@north.example',
    );
    expect(result.people.map((p) => p.email)).toEqual(['ada@north.example', 'bob@north.example']);
    expect(result.invalidLines).toEqual([2, 3]);
  });

  it('returns nothing for empty or whitespace-only input', () => {
    expect(parsePeopleList('')).toEqual({ people: [], invalidLines: [], duplicates: 0 });
    expect(parsePeopleList('   \n\t\n')).toEqual({ people: [], invalidLines: [], duplicates: 0 });
  });
});

describe('invite link helpers', () => {
  it('builds an accept URL that carries the token after # so it never reaches the server', () => {
    const url = inviteAcceptUrl('https://app.example', 'tok EN/+=');
    expect(url).toBe('https://app.example/select-tenant#invite=tok%20EN%2F%2B%3D');
    expect(url.split('#')[0]).toBe('https://app.example/select-tenant');
  });

  it('renders a tab-separated handout, one email and link per line', () => {
    const invites: CreatedInvite[] = [
      { email: 'ada@north.example', token: 'aaa' },
      { email: 'bob@north.example', token: 'bbb' },
    ];
    const text = inviteLinksText('https://app.example', invites);
    expect(text.split('\n')).toEqual([
      'ada@north.example\thttps://app.example/select-tenant#invite=aaa',
      'bob@north.example\thttps://app.example/select-tenant#invite=bbb',
    ]);
  });
});
