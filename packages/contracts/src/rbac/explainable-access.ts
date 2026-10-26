import { canonicalPermission, permissionMatches, permissionParts } from './permission-match.js';

// WI-OI-120 (Phase 4, R12 explainable access): given what a principal was granted and what a screen or route requires,
// say plainly WHY access is allowed or denied — which grant conferred it, or that nothing covers the requirement. Pure
// and dependency-free (built on the one permission-match rule), so the control plane, the web and the Assistant explain
// access the same way. It decides nothing about scope rows; it explains the permission check.

export type AccessDecision = 'ALLOWED' | 'DENIED';
export type AccessReason =
  | 'WILDCARD_ALL' // the `*` grant
  | 'FAMILY_WILDCARD' // a `family:*` grant
  | 'EXACT_GRANT' // the exact code is granted
  | 'NOT_GRANTED' // nothing covers it
  | 'MALFORMED_REQUIREMENT'; // the required code is not a valid permission

export interface AccessExplanation {
  readonly decision: AccessDecision;
  readonly reason: AccessReason;
  /** The requirement in canonical (colon) spelling, or the raw input when it is malformed. */
  readonly requiredCode: string;
  /** The granted code that allowed it (absent when denied). */
  readonly matchedGrant?: string;
  /** A one-line, human-readable explanation suitable for a tooltip or audit note. */
  readonly message: string;
}

function reasonFor(
  grant: string,
): Extract<AccessReason, 'WILDCARD_ALL' | 'FAMILY_WILDCARD' | 'EXACT_GRANT'> {
  const parts = permissionParts(grant);
  if (parts?.length === 1) return 'WILDCARD_ALL';
  if (parts?.length === 2 && parts[1] === '*') return 'FAMILY_WILDCARD';
  return 'EXACT_GRANT';
}

/** Explain whether `grantedCodes` cover `requiredCode`, and why. The first covering grant (if any) is reported. */
export function explainAccess(
  grantedCodes: readonly string[],
  requiredCode: string,
): AccessExplanation {
  const canonical = canonicalPermission(requiredCode);
  if (canonical === null)
    return {
      decision: 'DENIED',
      reason: 'MALFORMED_REQUIREMENT',
      requiredCode,
      message: `“${requiredCode}” is not a valid permission code, so it is denied.`,
    };

  const matchedGrant = grantedCodes.find((grant) => permissionMatches(grant, canonical));
  if (matchedGrant === undefined)
    return {
      decision: 'DENIED',
      reason: 'NOT_GRANTED',
      requiredCode: canonical,
      message: `Denied: no role grants ${canonical}.`,
    };

  const reason = reasonFor(matchedGrant);
  const message =
    reason === 'WILDCARD_ALL'
      ? `Allowed: the all-permissions grant (*) covers ${canonical}.`
      : reason === 'FAMILY_WILDCARD'
        ? `Allowed by the ${canonicalPermission(matchedGrant)} grant, which covers ${canonical}.`
        : `Allowed by a grant of ${canonical}.`;
  return { decision: 'ALLOWED', reason, requiredCode: canonical, matchedGrant, message };
}
