// WI-OI-120n, WI-OI-120az: an invitation token travels after `#`, so the browser never sends it to the server and no
// server log or proxy records it. These rules carry it from the administrator's link through sign-up, sign-in and
// MFA to the accept step, without a query string or storage.

/** The invitation token in an address: `#invite=` (current links) or `?invite=` (older links); null when there is none. */
export function inviteTokenFrom(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href, 'http://invitation.local');
  } catch {
    return null;
  }
  const token = (new URLSearchParams(url.hash.slice(1)).get('invite') ?? url.searchParams.get('invite') ?? '').trim();
  return token || null;
}

/** The path with the token after `#`; the path alone when there is no token. */
export function withInvite(path: string, token: string | null | undefined): string {
  return token ? `${path}#invite=${encodeURIComponent(token)}` : path;
}

/** Where a person goes once signed in: to accept the invitation they came with, or to the usual page. */
export function afterSignIn(usual: string, token: string | null | undefined): string {
  return token ? withInvite('/select-tenant', token) : usual;
}
