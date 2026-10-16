# WI-OI-120az: The invitation link keeps its token; a reload keeps the Organization tab

- **Status:** Built (2026-10-16), not yet released. Approved by the owner on 2026-10-16 ("approved 120az").
- **Plan v3:** step 0.8, "Core UX now" (journey findings since `7i0v43`; still in `ainvqh`).
- **Work item:** WI-OI-120. Evidence goes in `.pi/work/WI-OI-120.md`.
- **Size:** S. Web app and journey only: no API, contract, migration or env change.

## What the journey reports

- **UX, every invitee:** "The invitation link does not fill in its token: the person must paste it by hand"
  (`/select-tenant`).
- **UX:** "A reload loses the tab you were on: after reloading /settings the page opened on its first tab" (step
  "Units: two sites and an area").

## Cause (read-only, 2026-10-16)

**A. The invitation token is lost on the way in.**

- The administrator's link is `/select-tenant#invite=<token>`. The token sits after `#`, so it is never sent to the
  server (WI-OI-120n). `app/(auth)/select-tenant/page.tsx` reads it once, when the page first loads, then removes it
  from the address.
- **A new invitee is signed out**, which is the usual case.
  - The page reads the token, but loading the person's workspaces fails, and the page shows only an error. Signed
    out, `/select-tenant` answers 200 with no sign-in or sign-up prompt.
  - After signing up or signing in, `AccountForm` sends the person to `/select-tenant` without the token.
  - So the person must find the token in the link and paste it by hand.
- **A person already on `/select-tenant`** who opens the link in the same tab changes only the part after `#`. The
  page does not load again, so it never reads the token. This is the journey's path: sign up, then open the link.

**B. Organization's inner tab is not in the address.**

- Settings keeps its main tab in the address (`/settings?tab=hierarchy`), so a reload keeps it.
- Organization's inner tabs (Structure, Units, Unit types, Access) live only in the page's state
  (`OrganizationAdministration.tsx`: `useState('structure')`), so a reload goes back to Structure.
- No other Settings section has inner tabs.

## Design

**S1. The invitation keeps its token** (`select-tenant/page.tsx`, `AccountForm.tsx`):

1. When the token is present and the person is signed out, the page says so, with "Sign in" and "Create an account"
   links. Each link carries the token after `#`, as the original link does, so it is still never sent to the server
   or stored.
2. `AccountForm` keeps a `#invite=` token through sign-up and sign-in. Afterwards it goes to
   `/select-tenant#invite=<token>`, whether or not the person already has a workspace. The token arrives filled in;
   the person presses Accept.
3. `/select-tenant` also reads a token that arrives while the page is open (a `hashchange`), so opening the link in
   the same tab fills it in.
4. **Unchanged:**
   - the token never appears in a query string, in storage or in a server log;
   - accepting still needs the signed-in person, and the server still checks the invitation (email, expiry,
     one use).

**S2. A reload keeps the Organization tab** (`OrganizationAdministration.tsx`):

- The inner tab goes into the address as `/settings?tab=hierarchy&section=units`, and is read back on load. An
  unknown section falls back to Structure.
- Choosing a main Settings tab still clears it.

**S3. The journey:**

- **The first invitee takes the real path:** open the link while signed out, then "Create an account", then the token
  arrives filled in. The others keep today's path: sign up, then open the link in the same tab.
- **Both paths must fill the token.** An empty token stays a UX finding.
- **The Units reload** must come back on Units.

## Built (2026-10-16)

- **One rule for the link** (`lib/invitation-link.ts`):
  - `inviteTokenFrom` reads `#invite=`, or the older `?invite=`;
  - `withInvite` puts the token after `#` only;
  - `afterSignIn` sends a person with a token to `/select-tenant#invite=…`.

  The administrator's link in Team settings is now built with `withInvite`; the address it makes is unchanged.
- **The accept page** (`select-tenant/page.tsx`):
  - when loading workspaces answers 401, it shows "You have been invited to a workspace. Sign in, or create an
    account, to accept the invitation", with Sign in and Create an account links that carry the token after `#`;
  - it no longer shows the raw error, and hides the workspace card and the sign-out link while signed out;
  - it also reads a token that arrives while the page is open (`hashchange`).
- **Sign-in and sign-up** (`AccountForm.tsx`):
  - the form says the person is accepting an invitation;
  - the switch between sign-in and sign-up keeps the token;
  - after success, the person goes with the token to the accept step, or to MFA first when it is due. This uses a
    full page load, so the next page reads the token from its own address.
- **MFA** (`mfa/page.tsx`): its four "on to the modules" exits go on to the accept step when the person came with a
  token.
- **Organization tab** (`OrganizationAdministration.tsx`, `orgSectionFrom` in `organization-client.ts`):
  - the inner tab is kept as `?section=` next to `?tab=hierarchy` and read back on load;
  - an unknown value falls back to Structure;
  - choosing a main Settings tab still clears it.
- **The journey:**
  - the first invitee opens the link signed out, follows "Create an account", signs up, and must land back on the
    invitation with the token filled in; otherwise each missing step is a UX finding;
  - the other three sign up first, then open the link in the same tab (the `hashchange` path);
  - the "token not filled" finding stays for both paths.
- **Verification:**
  - the new `invitation-link.test.ts` (4 tests) and `organization-client.test.ts` (13, including the tab rule) pass;
  - the web suite: 688 passed, 107 skipped (database-backed), none failed;
  - web type-check: no errors in source;
  - the journey spec type-checks and loads;
  - lint:
    - the changed web files have no new findings (two `role="status"` notices were made plain text, as they are
      not live updates);
    - the journey has one fewer non-null assertion than at HEAD;
  - audits pass; design tokens fails only on the 3 files other sessions own, as before.
- **Not changed:** the server, contracts, the invitation rules (email, expiry, one use), and storage. The token is
  never put in a query string, `localStorage` or `sessionStorage`.
- **Next:** release, Security review, the owner's deploy, then the journey on UAT.

## Tests

- **Unit tests for the token and section rules:**
  - read `#invite=` (and the old `?invite=`);
  - build the sign-in and sign-up links with the token after `#`;
  - keep `section` and fall back on an unknown one.
- **Checks:** the web type-check, the web suite, and the audits (zero-mock, navigation, design tokens).
- **On UAT, after the owner deploys:** the journey shows neither UX finding (the token and the reload).

## Done when

- [ ] An invitee who opens the link signed out, then signs up or signs in, reaches the accept step with the token
  filled in.
- [ ] Opening the link in a tab already on `/select-tenant` fills the token.
- [ ] A reload on any Organization tab stays on that tab.
- [ ] Released and Security-reviewed. The owner has deployed it and the journey shows neither finding.
