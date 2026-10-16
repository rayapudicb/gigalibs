# WI-OI-120ba: An invitation shows its workspace and role before Accept

- **Status:** Built (2026-10-16), not yet released. Approved by the owner on 2026-10-16.
- **Plan v3:** step 0.8 follow-up, from the Security review of release `8a95dc9` (WI-OI-120az, finding Low 1).
- **Work item:** WI-OI-120. Evidence goes in `.pi/work/WI-OI-120.md`.
- **Size:** S to M: one server route, its contract, the accept step, and tests. No migration.

## Why

- **The person can't see what they're joining.** The accept step (`/select-tenant`) shows only the token box and an
  Accept button.
  - After one click, the person is a member of the workspace and is switched into it straight away (WI-OI-120n).
  - Nothing tells them which workspace that is, which role they get, or who invited them.
- **So a crafted link can lure someone.** An administrator of a workspace can invite a real person's email and send
  them a link: "You have been invited to a workspace" leads to Accept, and the person lands in that workspace.
  - The server still allows only the invited email to accept.
  - But the person cannot tell a real invitation from a lure.
- **This predates WI-OI-120az.** That release made the path smoother, which is why the review raised it.

## Design

1. **Server:** `POST /api/v1/tenants/invitations/preview` with `{ token }`.
   - The token goes in the body, as for accept, so it never reaches an address or an access log.
   - Signed in, same tenant boundary as accept (`skipTenantBoundary`), `Cache-Control: no-store`.
   - The service uses the same lookup and checks as `acceptInvite`, but writes nothing:
     - the token's hash;
     - not accepted, not revoked, not expired;
     - the invitation's email equals the signed-in person's email;
     - the workspace is active.
   - **Answer:** the workspace name, the role in words, who invited the person (name), and when the invitation
     expires.
   - **Any failure** gives the same answer as accept's refusal ("This invitation is not valid for your account"), so
     nothing reveals whether a token, workspace or email exists.
2. **Contract:** `InvitationPreviewV1` in `packages/contracts`, with the server and web both using it.
3. **Accept step:** as soon as the token is known and the person is signed in, the page asks for the preview.
   - It shows "Join **<workspace>** as **<role>**, invited by **<name>**; this invitation expires on **<date>**."
   - The button reads "Join <workspace>".
   - If the preview is refused, the page says so and offers no Accept.
   - After accepting, the person is still taken into the workspace, now knowing which one.
4. **The journey** checks that the preview names the journey's workspace and the persona's role before accepting.

## Built (2026-10-16)

- **Contract:** `TenantInvitePreviewV1Schema` in `packages/contracts/src/tenancy`, with the workspace name, role code,
  inviter's name (or null) and expiry.
- **Server** (`TenancyService.previewInvite`, `POST /api/v1/tenants/invitations/preview`):
  - The route is signed in, with `skipTenantBoundary` and `Cache-Control: no-store`, and answers 200.
  - The token is in the body and looked up by its hash.
  - The checks run in accept's order, with accept's answers:
    1. anyone but the active invitee gets the one refusal "Invitation is invalid for this user", whatever the
       invitation;
    2. the invitee then hears, as accept would say, that the workspace is not accepting members;
    3. or that they are already a member;
    4. or that the invitation is expired, revoked or already accepted.
  - It writes nothing; accept still checks everything again, including the sender's authority.
  - It shows the inviter's name, never their email.
- **Accept step** (`select-tenant/page.tsx`):
  - once signed in with a token, the page asks for the preview, with a 300 ms pause after typing;
  - it shows "Join **<workspace>** as **<role in words>**, invited by **<name>**. This invitation expires on …";
  - the button reads "Join <workspace>" and stays disabled until the preview succeeds;
  - a refusal says "This invitation is not for this account. Sign in with the email address it was sent to", or
    gives the server's reason to the invitee.
- **Journey:** before Accept, it waits for "Join <journey workspace> as"; otherwise it records a UX finding.
- **Verification:**
  - `invitation-preview.test.ts` (5 tests) passes: what the invitee sees; the hash lookup; nothing written; the one
    refusal for anyone else (wrong email, unknown token, revoked in another workspace, suspended person); the
    invitee's specific answers; no inviter address;
  - tenancy and contracts: 389 passed; web: 688 passed;
  - no type errors (contracts, tenancy, web, journey);
  - no new lint finding;
  - the audits pass. Design tokens is unchanged: the error text uses `text-ui-fg-error`.
- **Next:** release (server and web), Security review, the owner's deploy, then the journey on UAT.

## Tests

- **Service:**
  - the preview for a valid token returns the workspace, role, inviter and expiry;
  - a wrong email, an expired, revoked or accepted invitation, or an unknown token each give the same refusal;
  - the preview writes nothing.
- **Route:** signed out answers 401.
- **Web:**
  - the accept step shows the preview, and withholds Accept on a refusal;
  - the type-check, the suite and the audits pass.
- **On UAT:** the journey sees the preview for every invitee.

## Done when

- [ ] Before accepting, a person sees which workspace, role and inviter the invitation is for.
- [ ] A token that is not valid for the signed-in person shows nothing about the invitation.
- [ ] Released, Security-reviewed, deployed by the owner; the journey shows the preview.
