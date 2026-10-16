# WI-OI-120bc: Generative UI as a standalone, embeddable product

- **Status:** Proposed (2026-10-16; owner: "card the standalone product"). A separate track after Phase 1. Its slices
  are carded and shown for approval before any work starts.
- **Plan v3:** a new track after Phase 1. It builds on GU1–GU7 (steps 1.4–1.10) and their design rules (plan v3,
  step 1C, owner 2026-10-16).
- **Work item:** WI-OI-120. Evidence goes in `.pi/work/WI-OI-120.md`.
- **Size:** XL, about 6–10 weeks with one writer. Re-sized once GU7 is proven on CMMS.

## What it is

The GigaLibs generative UI and Assistant offered on their own, so another company's system can use them without
GigaLibs. The pieces:
- the metadata renderer and its component registry;
- the card contracts;
- the tool generation;
- the confirm-before-change rule;
- the chat.

The host system describes its data and actions, and its users get:
- generated screens and cards for that data;
- an Assistant that answers from the host's own data, as the signed-in person;
- confirmed, audited actions;

on the web, and later on mobile. Nobody writes UI or Assistant code for each screen.

## Why it is possible

Phase 1's design rules (owner, 2026-10-16) already require it. The renderer, the registry and the client must be
host-neutral packages, and the dictionary must have a public format. They also require an embeddable chat, tools
exposed in a standard protocol, platform-neutral cards and a closed component catalogue. This track turns those
boundaries into a product. Nothing here starts before GU7 proves the Assistant on CMMS.

## Proposed slices (each carded and approved before it starts)

| # | Slice | What it delivers |
| --- | --- | --- |
| SP1 | Packages and contracts | The renderer, registry, card contracts and Assistant client as versioned packages. The public dictionary schema (JSON Schema) with a compatibility policy |
| SP2 | Bring your own data | An adapter that turns a host's API description (OpenAPI) into windows, fields and tools, with the host's own permissions mapped in |
| SP3 | Embeddable widget | A web component for the chat and its cards. Sign-in through the host's identity (OIDC token exchange). Theming through design tokens |
| SP4 | Standard tool protocol | A tool server compatible with MCP, so outside assistants can use the tools safely as the person. Optionally, consuming a host's own tool servers |
| SP5 | Hosting and commercial | Hosted multi-tenant or self-hosted packaging, model choice per customer (local model by default), metering and billing hand-off (T8b) |
| SP6 | Mobile | A mobile renderer for the registered components (with X7), proving the same contracts on a phone |
| SP7 | Proof and assurance | A sample host integration, developer documentation, a Security and Privacy review, and an outside penetration test |

## Decisions for the owner, before SP1

1. **Product name and positioning:** a GigaLibs add-on, or a separate brand.
2. **Delivery model:** hosted by GigaLibs, self-hosted, or both.
3. **Licensing:** commercial only, or an open core (for example open contracts and renderer, commercial Assistant
   runtime).
4. **Model policy for outside customers:** the local model only, or customer-chosen providers per tenant.
5. **Timing:**
   - after Phase 1, sequential, which delays Phase 2 by the track's length;
   - or in parallel with Phase 2, which needs a second implementation writer, an AGENTS.md change.

## Done when

- [ ] Each slice has been carded, approved, built, Security-reviewed and released.
- [ ] A sample host system, not GigaLibs, shows generated screens and an Assistant on its own data, with its own
  sign-in, with no UI or Assistant code written per screen.
- [ ] The tools work through the standard protocol, as the person, with every action confirmed and audited.
- [ ] The same contracts render on mobile (with X7).
