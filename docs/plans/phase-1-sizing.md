# Phase 1 sizing and proposed order (2026-10-16)

This is the size of each plan v3 Phase 1 step, an order of work, and the dates that follow from it, for the owner to set
deadlines.

**Status:** approved by the owner on 2026-10-16. The order and the dates change only when the owner approves.

## Basis

- **Sizes, from this week's actual pace.** WI-OI-120ax and WI-OI-120az each took about half a day from card to UAT,
  including the release, the Security review and the owner's deploy.

  | Size | Releases | Working days, from card to UAT |
  | --- | --- | --- |
  | **S** | 1 | 0.5–1 |
  | **M** | 1–2 | 2–4 |
  | **L** | 3 or more | 5–10 |

- **One implementation writer at a time** (AGENTS.md). Work is sequential unless the owner allows a second writer.
- **The owner** approves each card and runs each deploy within a working day.
- **The calendar:** dates count weekdays from Monday 2026-10-19. Holidays are not counted.
- **Each date has three values:** the "plan" figure uses each size's middle value, and the range runs from the lowest
  to the highest. Re-estimate after Wave 1 from the actual figures.

## Steps, sizes and order

| Wave | Step | Size | What remains |
| --- | --- | --- | --- |
| **W1. CMMS done right** | 1.1 R5 CMMS unit and site scope (120z, 120aa, 120ab, 120ac) | M | Built, not reviewed: review, release, switch on, journey (North cannot see South) |
| | 1.3 M-CM1 work orders (120t, 4 slices) and 120ag | L | Built, not reviewed. Raise the CMMS migration pin to 20. Clears the journey's 2 CMMS blockers |
| | 1.2 T3 one place identity (120ad, then the rest) | L | Projection built; moving CMMS spaces onto Geospatial places not started |
| **W2. Sign-up, email and sign-in security** | 1.12 N1 email delivery | L | Packages exist and no app uses them. Needs the owner to choose an email provider |
| | [WI-OI-120bb](../../.pi/tasks/WI-OI-120bb.md) email verification at sign-up | M | Proposed; needs N1 |
| | 1.14 R17 MFA for administrators, password reset by email | M | TOTP code exists, not proven on UAT |
| | [WI-OI-120ba](../../.pi/tasks/WI-OI-120ba.md) invitation preview before Accept | S | Proposed |
| **W3. Workspace lifecycle and data rights** | 1.11 T8a lifecycle and module tiers | L | Partly built; no suspension; tiers not enforced |
| | 1.16 T9a export and deletion | M | An export screen exists; deletion with proof is new |
| | 1.15 R11 platform support access | M | Not started |
| **W4. Production operations** | 1.17 O1 hardening: domain, TLS, secrets, security headers | L | Needs the owner's domain and hosting decisions |
| | 1.18 O2 automatic backups, restore drill, rollback per migration | M | Backups run by hand today |
| | 1.19 O3 logs, metrics, alerts that reach a person | L | Relay health exists; needs an alert channel |
| | 1.20 O5 dependency, secret and image scanning on every build | M | Not started |
| | 1.21 O6, O7 runbooks and CMMS guides | M | Not started |
| **W5. Assistant** | 1.4 GU1 Assistant service | L | Today's Assistant is a preview |
| | 1.5 GU2 tools from the dictionary | L | |
| | 1.6 GU3 cards from the renderer | M | |
| | 1.7 GU4 confirm before change | M | |
| | 1.8 GU5 grounded answers | M | |
| | 1.9 GU6 adoption kit | M | |
| | 1.10 GU7 proven on CMMS | M | |
| **W6. Set-up wizard** | 1.13 T11a CMMS set-up wizard | L | Needs W1 and W3 |

The remaining step 0.8 items (about 8 small ones, batched into about 4 releases, 4–8 days) go into W1's releases
rather than before them. Phase 0's exit conditions are met, except decision b (named reviewers).

## Dates

| Wave | Working days (plan, range) | Ends: plan | Ends: range |
| --- | --- | --- | --- |
| W1 CMMS done right | 17 (12–24) | 2026-11-10 | 2026-11-03 to 2026-11-19 |
| W2 Sign-up, email, sign-in security | 14 (9.5–19) | 2026-11-30 | 2026-11-17 to 2026-12-16 |
| W3 Lifecycle and data rights | 13 (9–18) | 2026-12-17 | 2026-11-30 to 2027-01-11 |
| W4 Production operations | 23 (16–32) | 2027-01-19 | 2026-12-22 to 2027-02-24 |
| W5 Assistant | 29 (20–40) | 2027-03-01 | 2027-01-19 to 2027-04-21 |
| W6 Set-up wizard | 7 (5–10) | 2027-03-10 | 2027-01-26 to 2027-05-05 |
| **Phase 1 total** | **103 (71.5–143), about 21 weeks (14–29)** | **2027-03-10** | **2027-01-26 to 2027-05-05** |

Add about 6 days for the step 0.8 items placed in W1, and any holidays.

## Decisions that move these dates (owner)

1. **Assistant before or after go-live.** Plan v3's Phase 1 exit includes the Assistant (W5).
   - A first CMMS customer could go live without it after W4, about 2027-01-19.
   - The Assistant would then follow in about 6 weeks.
   - This changes the plan, so it is the owner's call.
2. **A second implementation writer**, for example for W4, would cut about 4–5 weeks. AGENTS.md allows one writer at
   a time today.
3. **Inputs only the owner can give,** each of which holds its wave:
   - an email provider account (W2);
   - a domain and hosting for TLS (W4);
   - an alert channel and the person alerts reach (W4);
   - named reviewers (0.7b).
4. **`gigalibs-global`'s trial ends 2026-12-16,** before W3 builds workspace lifecycle. Extend it or convert it in
   Platform Control Tower before that date.
