# WI-OI-065 Jobs, positions and engagements review request (roadmap P5, first half)

Date: 2026-09-27  
Profiles: `configuration-local-development-v1` with the Workforce, Geospatial and modules overlays  
Decision requested: bounded Local Development G4 review; Product Owner acceptance (below)

## Implemented outcome

A workforce manager can describe the roles the organisation needs, the positions it holds at its sites and who
fills them, with dates, and read the organisation as of any day:

- **Effective-dated job profiles.**
  - Each profile has a title, a worker category (employee, contractor, agency or volunteer) and the
    capabilities it requires, drawn from the Workforce capability catalogue.
  - A change is a new revision from a later date. The current definition stays in force until then, history is
    never rewritten, and back-dated or stale changes are refused.
- **Positions at Geospatial sites.**
  - Each position has an FTE and a window. It cannot start before its profile exists.
  - Shortening a position or lowering its FTE is refused while an engagement would be stranded.
- **Engagements.**
  - Only a person (not a team or pool) is engaged, inside the position window and FTE.
  - The database refuses a second incumbent for any overlapping day. A successor can start the day after the
    previous engagement ends.
  - An engagement that has not started can be withdrawn.
- **Evidence and scope.**
  - Every change writes audit and outbox facts in the same transaction, and every table has forced RLS.
  - Department and exact place scope apply: a member scoped to a site sees and changes only that site's
    positions.
- **Screen:** GigaOps → Jobs & positions (Medusa UI). It has an as-of date and profile history with "change
  from a date", and positions by site show filled and vacant state. From there you engage, end or withdraw.

## Exact evidence identity

| Artifact | Identity |
| --- | --- |
| Workforce image | `gigalibs/workforce-api:5abfa667bb10-123687d19b32` (schema contract 6, covers WI-OI-065 and WI-OI-066) |
| Other services | unchanged at the certified P4 identity `5abfa667bb10-7507432cb066` |
| Image policy | `infra/compose/evidence/wi-oi-065-066-20260927T091400Z`: 0 Critical, 0 High |

## Measured result

- The live Workforce schema upgraded from 4 to 6.
- Runtime, HTTP, the WI-OI-061 journey, jobs (`verify-workforce-jobs.sh`) and availability
  (`verify-workforce-availability.sh`) certifications pass on the exact image.
- Jobs:
  - revisions close the prior one, and back-dated or stale revisions are refused;
  - as-of titles and incumbents are correct;
  - one incumbent per position, enforced by the database;
  - window and FTE rules hold, successor engagements work, and withdrawal works;
  - exact place scope; restart persistence; tenant B denied 8 operations;
  - 13 audit = 13 outbox facts.

## Open item — web image blocked by unregistered forms work

The full chain's web image step fails on forms work that appeared in the tree around 13:50 and is not part of
this item: the forms engine imports `@gigalibs/db` into the web app and adds two unreviewed control-plane
migrations. It was not modified. To avoid applying those migrations, only the Workforce image was deployed.
The Jobs & positions screen is type-checked and unit-tested. Its live web-path certification
(`verify:workforce-jobs-web-path`) runs once the web image builds.

## Product Owner acceptance run

1. GigaOps → Skills & qualifications: define a capability.
2. Resources: add two people.
3. Jobs & positions:
   - Create a job profile that requires the capability, then change its title from a future date.
   - Switch the as-of date before and after that date and confirm the title changes.
4. Create a position at a site and engage the first person.
5. Try to engage the second person over the same period: it must be refused.
6. End the first engagement, then engage the second person from the next day.

## Review decisions required

1. Solution Architecture / Product:
   - revision-only history (no back-dated corrections yet);
   - one incumbent per position;
   - the neutral worker categories;
   - pay stays out of positions (P8).
2. Security & Privacy / IAM: the new `workforce.jobs|positions|engagements.*` scopes, the scope predicates and
   `spatialScope` in the Workforce principal.
3. Backend/Data: the exclusion constraints (`btree_gist`), the calendar-date model, migration 000005 and
   contract 5.
4. API Contracts: the Workforce V1 additions.
5. Web/Accessibility: the Jobs & positions screen and its states.
6. QA/SDET: the live scripts and unit tests in `.pi/work/WI-OI-065.md`.

## Registered limitations

- Back-dated corrections of a revision need an audited correction capability (future).
- Tenant custom fields through the Configuration Studio adapter: 065b.
- Roster import as a durable job: 065c.
- Availability and absence: WI-OI-066.
- Pay: P8.
- Place scope is exact: sites below a scoped region appear once a place directory projection exists.
