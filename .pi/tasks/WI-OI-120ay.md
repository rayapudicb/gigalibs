# WI-OI-120ay: A platform owner login the owner can use on UAT

- **Status:** Approved (owner, 2026-10-16: "approved 120ay"). The login is chosen when the script runs; the owner
  asked for `newuser@gigalibs.io`. The owner chooses the password on the reset page.
- **Plan v3:** step 0.8. It replaces the tooling item "an owner-run password reset for `uat.admin@gigalibs.io`", and
  it unblocks WI-OI-120aw.
- **Work item:** WI-OI-120. Evidence goes in `.pi/work/WI-OI-120.md`.
- **Size:** S. One owner-run script; no product code.

## Why

The WI-OI-120aw suspension signs in as a platform owner, and its first run was refused (401, 2026-10-16 03:57Z). The
owner knows no platform login's password. UAT is production, so a platform owner login the owner controls is needed
anyway, to run Platform Control Tower at all.

What UAT holds (read-only, 2026-10-16):

| Login | Role | Notes |
| --- | --- | --- |
| `superadmin@gigalibs.io` | PLATFORM_OWNER | Active; never signed in; email not verified; member of `gigalibs-global` |
| `newuser@gigalibs.io` | PLATFORM_OWNER | Active; signed in 2026-10-09; one earlier reset; password unknown to the owner |
| `wi-oi-064e.platform-admin.…@gigalibs.invalid` | PLATFORM_ADMIN | A certification test account |

None of the three has MFA.

The existing `scripts/bootstrap-platform-authority.mjs` cannot help: it refuses while any platform owner exists.

## Design: the product's own assisted reset, issued by an owner-run step

The product already resets passwords this way (`issuePasswordReset`, `POST /platform/users/:id/password-reset`):

1. A platform owner issues a one-time credential. Only the token's SHA-256 is stored; the link is shown once.
2. The person opens `/reset-password?token=…` and chooses a password. The product checks its strength, hashes it,
   revokes the login's sessions and writes the audit record.

Step 1 needs a platform owner signed in, which is the very thing missing. So an owner-run script does step 1 only,
exactly as the product does it:

- **Before writing:** it needs a fresh, verified backup, and takes the target login as an argument
  (`superadmin@gigalibs.io` recommended).
- **One guarded transaction:**
  1. Any open credential of that login is closed.
  2. One `password_reset_credentials` row is inserted: the token's digest, 30 minutes' validity, the reason
     "WI-OI-120ay: owner recovery of the platform owner login", and the login itself as requester (no other actor
     exists).
  3. One audit record is written, `ASSISTED_RESET_ISSUED`, delivery `OWNER_RUN_CONSOLE`.
- **The token:** it is made on the owner's machine and printed once, only in the owner's terminal. It is never
  written to a file, and never pasted into chat.
- **Step 2 is the product:** the owner opens the link and chooses a new password, not one used for test accounts.
  No password passes through the script.

## After the login works (owner, in Platform Control Tower)

- **Run WI-OI-120aw**, with `--email` set to this login.
- **Enrol MFA** on this login. The suspension script refuses MFA logins, so this comes after the run.
- **Review the other two platform roles** (recommended: revoke both, through the product's platform-role
  administration):
  - `newuser@gigalibs.io` holds PLATFORM_OWNER, and its password is held by someone other than the owner;
  - the certification account holds PLATFORM_ADMIN on production.

## Tests

- The script's unit tests: the token's digest matches the product's `sha256(token)`; the SQL embeds only checked
  values; it refuses an unknown or inactive login and a missing or stale backup.
- A rehearsal on a throwaway PostgreSQL with the real tables: one credential, one audit record, earlier open
  credentials closed.
- **On UAT:** the owner's reset succeeds through `/reset-password`, and the sign-in works. Read-only: the
  credential is used, the audit records exist, and the login's earlier sessions are revoked.

## Built (2026-10-16): checked read-only on UAT, rehearsed

`scripts/uat/wi-oi-120ay/issue-reset.mjs`, with `lib.mjs` and `lib.test.mjs`.

- **Modes:**
  - check (read-only, the default);
  - `--apply`, which needs a backup under an hour old: checksum, metadata, and a restorable listing of users, reset
    credentials, audit and sessions;
  - `--verify` (read-only, after the reset).
- **Refusals:** only a plain address reaches the SQL. The SQL raises and writes nothing unless the login is exactly
  one active platform owner.
- **What it writes:** the token's digest is the product's `sha256(token)`. The link is printed once, and only after
  the read-back holds.
- **Tests:** 6 pass; Biome is clean.
- **UAT, read-only:**
  - `newuser@gigalibs.io` and `superadmin@gigalibs.io` are accepted; `uat.admin@gigalibs.io` is refused (not a
    platform owner).
  - `newuser@gigalibs.io` has 80 live sessions, all from 2026-10-09. The product's reset revokes them.
- **Rehearsal** on a throwaway PostgreSQL, offline, with UAT's table structure restored schema-only from
  `gigalibs_backup_20261016_035600Z`:
  - a non-owner is refused, both by the script and by the SQL's own guard, and nothing is written;
  - for the owner:
    - the earlier open credential is closed;
    - exactly one new credential is open, and the issue is audited;
    - the constraints and the append-only audit trigger hold;
  - `--verify` says "not yet" before the reset, and "verified" after the product's reset writes (mimicked from
    `resetPassword`).

## Owner run (2026-10-16): the login works

- **Backup:** `gigalibs_backup_20261016_035600Z`.
- **Issued twice:** a link at 04:09:40Z, then a second at 04:15:24Z, which closed the first. Both issues are audited.
- **The owner set the password** on the product's reset page. Their sign-in has worked since 04:18:58Z.
- **Read-only verify** (04:19Z): the credential is used and the reset is audited (`ASSISTED_RESET_CONSUMED`). No
  reset link is left open. The login's 80 earlier sessions are revoked, so only the owner's new session is active.
- **The second link was pasted into the chat before use.** It was used within minutes, by the owner, so it is spent.

## Done when

- [ ] The owner signs in to UAT as a platform owner with a password only they know.
- [ ] MFA is enrolled on that login (after WI-OI-120aw).
- [ ] The owner has decided on the other two platform roles, and the decision is applied through the product.
