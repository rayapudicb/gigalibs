# WI-OI-120bb: Prove the email at sign-up before it can be used

- **Status:** Approved (owner, 2026-10-16). Planned in W2, after N1. D1 and D2 are confirmed with the owner before
  it starts (recommended: D1a and D2a).
- **Plan v3:** Phase 1, with step 1.12 (N1 email delivery) and step 1.14 (R17 sign-in security). Raised by the
  Security review of release `8a95dc9` (WI-OI-120az, Info 2).
- **Work item:** WI-OI-120. Evidence goes in `.pi/work/WI-OI-120.md`.
- **Size:** M, after N1 can send email.

## Why

- **Nobody checks that a person owns the email they sign up with.** `AuthService.register`
  (`packages/auth-nest/src/auth.service.ts:87-107`) creates the account as ACTIVE straight away. The status
  `PENDING_VERIFICATION` exists in the schema but is never used.
- **On UAT, read-only (2026-10-16):** 613 active accounts are unverified. Only 1 has a verified email, from single
  sign-on, the only path that sets `emailVerifiedAt`.
- **What it allows:** anyone can create an account under an address they do not own, and the server then treats
  them as that address. For example:
  - a person who finds an unused invitation link, on a shared computer or in a forwarded message, can register the
    invited email (if no account has it yet) and accept the invitation;
  - members, audit records and approvals can name an email whose owner never signed up.
- **UAT is production** (0.7a), so this matters before customers sign up.
- **Nothing can send email yet.** `notifications-core` and `email-templates` exist, but no app uses them (step 1.12,
  N1). Password reset is the assisted one only.

## Design

1. **Depends on N1:** the email channel (provider behind an adapter, retries, bounces, audit) is built first, in step
   1.12.
2. **Sign-up:**
   - creates the account as `PENDING_VERIFICATION` and sends a one-time verification link: only its hash is stored,
     valid 24 hours, single use, audited;
   - until the link is used, signing in leads only to a "Check your email" page (resend, change address);
   - opening the link sets `emailVerifiedAt` and the ACTIVE status.
3. **Invitations:**
   - accepting requires a verified email;
   - when N1 sends the invitation itself to the invited address, opening that emailed link also counts as proof.
4. **Existing accounts (decision D1):**
   - **a. Recommended:** at their next sign-in, every account without a verified email is asked to verify it, except
     single sign-on accounts, which are already verified.
   - b. Treat the existing accounts as verified.
5. **Until N1 exists (decision D2):**
   - **a. Recommended:** no interim change. The risk needs an invitation token, which is random, single use, expiring
     and stored hashed. Prioritise N1 within Phase 1.
   - b. Interim: an administrator confirms each accepted invitation before it takes effect.
6. **Sign-in security (R17, step 1.14):** password reset by email and MFA for administrators build on the same
   verified address.

## Tests

- **Sign-up:**
  - creates a pending account and sends one verification email;
  - the link verifies once, refuses a second use or an expired link, and is audited.
- **Before verification:**
  - a pending account cannot accept an invitation or reach the workspace pages;
  - the "Check your email" page works and its resend is rate-limited.
- **D1:** the chosen rule for existing accounts holds, with single sign-on accounts unaffected.
- **The journey:**
  - each persona verifies through the email channel's test inbox, not a skipped step;
  - this needs a test inbox for N1, part of 1.12.

## Done when

- [ ] No account can use an email it has not proven, except through single sign-on.
- [ ] Accepting an invitation requires a verified email.
- [ ] D1 and D2 decided and applied.
- [ ] Released, Security-reviewed, deployed by the owner; the journey verifies every persona.
