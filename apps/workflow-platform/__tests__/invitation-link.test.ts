import { describe, expect, it } from 'vitest';
import { afterSignIn, inviteTokenFrom, withInvite } from '@/lib/invitation-link';

// WI-OI-120az: the invitation token keeps travelling after `#` through sign-up, sign-in and MFA to the accept step.
describe('invitation link', () => {
  it('reads the token after # and from older ?invite= links', () => {
    expect(inviteTokenFrom('https://app.example/select-tenant#invite=abc_DEF-123')).toBe('abc_DEF-123');
    expect(inviteTokenFrom('/register#invite=abc')).toBe('abc');
    expect(inviteTokenFrom('/select-tenant?invite=old')).toBe('old');
    expect(inviteTokenFrom('/select-tenant?invite=old#invite=new')).toBe('new');
    expect(inviteTokenFrom('/select-tenant#invite=a%2Bb%2Fc')).toBe('a+b/c');
  });

  it('finds no token when there is none, or only blanks', () => {
    expect(inviteTokenFrom('/select-tenant')).toBeNull();
    expect(inviteTokenFrom('/select-tenant#invite=')).toBeNull();
    expect(inviteTokenFrom('/select-tenant#invite=%20%20')).toBeNull();
    expect(inviteTokenFrom('/select-tenant#other=1')).toBeNull();
  });

  it('carries the token after # only, never in the query', () => {
    expect(withInvite('/register', 'a+b/c')).toBe('/register#invite=a%2Bb%2Fc');
    expect(withInvite('/login', null)).toBe('/login');
    expect(withInvite('/login', '')).toBe('/login');
    const carried = new URL(withInvite('/login', 'tok'), 'https://app.example');
    expect(carried.search).toBe('');
    expect(inviteTokenFrom(carried.href)).toBe('tok');
  });

  it('sends a person with a token to the accept step, and others to the usual page', () => {
    expect(afterSignIn('/modules', 'tok')).toBe('/select-tenant#invite=tok');
    expect(afterSignIn('/modules', null)).toBe('/modules');
  });
});
