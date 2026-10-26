// WI-OI-120p (S17, people administration): parse an administrator's pasted list of people for a bulk invite. One
// person per line; the first column is the email and an optional second column (after a comma or tab) is their name.
// Blank lines, a leading header row ("email, name") and repeated emails are dropped. Parsing is deliberately lenient —
// the control plane does the authoritative validation and returns per-row errors — so this only structures the paste
// and flags the lines a person can still fix here (a cell with no usable email address).
import { withInvite } from './invitation-link';

export interface ParsedPerson {
  readonly email: string;
  readonly name?: string;
}

export interface ParsedPeople {
  readonly people: ParsedPerson[];
  /** 1-based line numbers that held text but no usable email. */
  readonly invalidLines: number[];
  /** How many repeated emails were collapsed into one. */
  readonly duplicates: number;
}

/** A pragmatic "is this an email" check — one `@`, a dot in the domain, and no spaces. The server checks for real. */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function parsePeopleList(text: string): ParsedPeople {
  const people: ParsedPerson[] = [];
  const invalidLines: number[] = [];
  const seen = new Set<string>();
  let duplicates = 0;

  text.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (line === '') return;
    const cells = line.split(/[,\t]/).map((cell) => cell.trim());
    const first = cells[0] ?? '';
    const email = first.toLowerCase();
    // A header row such as "email, name" is skipped quietly rather than reported as a bad row.
    if (index === 0 && !looksLikeEmail(email) && /e-?mail/i.test(first)) return;
    if (!looksLikeEmail(email)) {
      invalidLines.push(index + 1);
      return;
    }
    if (seen.has(email)) {
      duplicates += 1;
      return;
    }
    seen.add(email);
    const name = cells[1] && cells[1].length > 0 ? cells[1] : undefined;
    people.push(name ? { email, name } : { email });
  });

  return { people, invalidLines, duplicates };
}

export interface CreatedInvite {
  readonly email: string;
  readonly token: string;
}

/**
 * The one-time link a person follows to accept an invitation. The token rides after `#` so the browser never sends it
 * to a server or a proxy log (see invitation-link). `origin` is the shell's own origin (`window.location.origin`).
 */
export function inviteAcceptUrl(origin: string, token: string): string {
  return `${origin}${withInvite('/select-tenant', token)}`;
}

/** A plain-text handout of the one-time links, one `email<TAB>link` per line, to distribute until email is wired. */
export function inviteLinksText(origin: string, invites: readonly CreatedInvite[]): string {
  return invites
    .map((invite) => `${invite.email}\t${inviteAcceptUrl(origin, invite.token)}`)
    .join('\n');
}
