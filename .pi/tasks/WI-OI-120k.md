# WI-OI-120k (QF1): Quick fixes from the UAT screen board

- **Status:** Approved (owner, 2026-10-06). Implemented and checked; awaiting deploy.
- **Work item:** WI-OI-120. Evidence goes in `.pi/work/WI-OI-120.md`.
- **Size:** S

## Fixes

1. **Parties:** the list query is validated, so `limit` is a number. "50" + 1 was "501", and Prisma answered 500.
2. **Settings → Plan (and Marketplace, which redirects there):** the trial date uses one format on the server and in
   the browser. The default locale differed, giving React error #418.
3. **Opportunities:** an honest notice. The SAM.gov sync route is a contained capability and was called as the page
   opened.
4. **Analytics overview and Places:**
   - the Analytics overview no longer calls the contained cross-module metrics, and its panel says why;
   - Places reads the Operations metric catalogue only once it is activated, and otherwise says how to set it up.
5. **Floating Softphone button:** the app's main area has bottom padding, so the button no longer covers the end of
   a page.
6. **Record titles:** a record is titled by its text field, else "<tab> <number>", never by a reference id or a
   status code.
7. **Walk-through:**
   - a screen's own data calls are told apart from the shell's, so a screen with none shows as NO DATA CALLS (a
     likely mock-up);
   - the tour and approval runs are in the repo;
   - the older UAT specs use the shared sign-in and exact field ids;
   - `catalogue-business-flow` is retired, replaced by the starter data and `uat-approvals`.
