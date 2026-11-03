# WI-OI-160 evidence — Relay wiring generated from manifests

## 2026-11-03 — inventory before building (queue item 3, claimed by Claude)

Relays are wired by hand: each producer reads a target URL and a signing (private) key, each consumer an inbox public
key, under names chosen per module, set per Compose service across `compose.yaml`, `compose.modules.local.yaml`,
`compose.workforce.local.yaml`, `compose.geospatial.local.yaml` and `generated/compose.module-host.yaml`.

**Both ends present in Compose (12 relays):** connector-hub → analytics; connector-hub → geospatial; geospatial →
analytics; CMMS → workforce; CMMS → analytics; workforce → CMMS; workforce → analytics; orders (module-host) → AR;
control plane (api) → business-partners (module-host); operator-rounds (module-host) → CMMS, workforce, analytics.

**Findings:**
1. **The QA-046 mis-wiring is still in Compose.** `kernel-worker` carries `BUSINESS_PARTNERS_RELAY_URL` and
   `BUSINESS_PARTNERS_INBOX_RELAY_PRIVATE_KEY_BASE64`, which it does not use — the api service relays party facts.
2. **Consumer keys the code reads but no Compose file sets** (corrected: the generated module-host file sets the
   Manufacturing, Projects and Returns command-inbox keys): `INVENTORY_INBOX_RELAY_PUBLIC_KEY_BASE64`,
   `FINANCE_INBOX_RELAY_PUBLIC_KEY_BASE64`, `PROCUREMENT_INBOX_RELAY_PUBLIC_KEY_BASE64`,
   `IOT_INBOX_RELAY_PUBLIC_KEY_BASE64`, `CONNECTOR_HUB_INBOX_RELAY_PUBLIC_KEY_BASE64`,
   `ANALYTICS_CONTROL_PLANE_INBOX_RELAY_PUBLIC_KEY_BASE64`, `INVENTORY_ATP_COMMAND_INBOX_PUBLIC_KEY_BASE64`,
   `INVENTORY_RESERVE_RELEASE_COMMAND_INBOX_PUBLIC_KEY_BASE64`.
   **Verified on UAT (read-only, names only):** the module-host container — which runs Inventory, Procurement and
   General ledger — has no Inventory, Procurement or Finance relay settings at all (neither the senders' URLs and
   signing keys nor the receivers' keys). So relays between those modules, for example Inventory → General ledger
   receipt posting, are not running on UAT; their events wait in each outbox. (The posting reconciliation job of
   QA-033 is what catches missed postings.)
3. **Producers whose consumer end is wrong or missing:** IoT → CMMS (`IOT_RELAY_CMMS_URL`; CMMS has no IoT inbox key);
   Project operations → AR (`PROJECT_OPERATIONS_AR_RELAY_URL: http://127.0.0.1:3400` inside the module-host
   container points at the module host itself, while AR runs as its own `ar-api` service; its key
   `AR_PROJECTS_INBOX_RELAY_PUBLIC_KEY_BASE64` is set on module-host, not on `ar-api`).
4. Producers name the key they do not need `…_RELAY_UNUSED_PUBLIC_KEY`, so a missing key fails silently.

## Plan (two slices)

- **A — declarations and `audit:relays`:** each relay declared once in the producer's manifest (`spec.relays`: the
  consumer module, the producer service with its URL and signing-key names, the consumer service with its public-key
  name); `scripts/verify-relay-wiring.mjs` (in `pnpm verify`) fails when a declared variable is not on the declared
  service in the Compose set, or a relay variable sits on a service no declaration names (finding 1). The relays of
  findings 2–3 are declared as `status: not-wired` with the reason, so the audit lists them instead of hiding them.
- **Owner decision needed before wiring the missing relays:** the key pairs are secrets the owner generates and
  keeps; turning the module-host relays on releases every waiting event (postings included) on the next deploy.
- **B — generation:** Compose environment blocks, the deployment profile's optional environment and
  `.env.example` written from the declarations (regenerating today's settings with no diff).

## Slice A — the relay register and `audit:relays` (built)

- `config/relay-wiring.json`: all 26 cross-service relays, each declared once (producer service, URL and signing key;
  consumer service and the public key(s) it verifies with) — 20 wired, 6 not wired with their reason
  (inventory → finance, inventory → procurement, finance → inventory, business partners → finance, IoT → CMMS,
  entitlements → analytics).
  *Departure from the card:* one reviewed register instead of `spec.relays` in each manifest. The code's relay
  configs name a target and signing key even where a module only receives, so the code alone cannot say who sends;
  one register is clearer to review and is what slice B generates from.
- `pnpm audit:relays` (`scripts/verify-relay-wiring.mjs`, `scripts/lib/relay-wiring.mjs`, part of `pnpm verify`):
  over the Compose files the UAT stack combines, a wired relay's variables must be on the services it names; every
  relay variable a service carries must belong to a declared relay there (a key on the wrong service fails); every
  declared name must be one the code reads; a not-wired relay needs a reason. Names only, never values.
- Wiring fixed by the audit: the party relay keys removed from `kernel-worker` (api sends them, QA-046);
  Project operations → AR now targets `http://ar-api:3400` (it pointed at the module host itself) and AR's inbox key
  moved from module-host to `ar-api`.
- Tests (`packages/configuration-core/src/relay-wiring.test.ts`): a correct relay passes; the QA-046 case (keys on
  kernel-worker, none on api) fails; a name no code reads fails; a not-wired relay is listed only with a reason.

Remaining: slice B (generate the Compose relay settings from the register), and the owner decision on the six
not-wired relays (keys, and a look at the waiting events first).
