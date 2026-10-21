# WI-OI-120ca: SPEED S7 — the dossier: one model, DOCX and PDF, JSON and CSV

- **Status:** Built, committed `32c010a1` on `feat/speed-s3-module` (owner, 2026-10-21: "start S7"; "commit"). Implementer: Claude Code, on the SPEED branch
  `feat/speed-s3-module` (worktree `gigalibs-speed-s3`), after S6 (`82f3b114`).
- **Work item:** WI-OI-120bn, slice S7 (plan v1.4 §5.1); screen spec §2.4 (panel `speed.dossier-preview`), §4.4, §4.5.
- **Size:** M.

## Goal

A chemist generates the route's screening dossier: one model with the eight sections of the screen spec, rendered as
DOCX and PDF by a background job, stored in the instance's object store with a SHA-256 checked on every download, and
watermarked "DRAFT — NOT APPROVED" on every page until approval (R2). The same model is the on-screen preview and the
JSON and CSV exports.

## Design

- **One model, shared:** a module-owned domain package (`modules/process-safety-screening/domain`) holds the message
  catalogue (moved from the web package) and the pure `dossierModel(route, sets, locale)`: summary, route and gate,
  thermal, interactions, actions before kilo-lab (`actionList`, S7a), Stage 2 plan (`stage2Plan`, S7a), basis and
  references (engine, criteria and library versions with citations, element table, inputs hashes), signatures (R2:
  "Not yet signed"). The API renders the files from it; the panel previews it; the exports serialise it.
- **Job, not request:** `POST routes/{id}/dossiers` records a queued dossier (idempotent) and answers 202; a worker in the
  module claims queued dossiers (a SECURITY DEFINER function lists the tenants with work, as the platform's relays do;
  each dossier is claimed with `FOR UPDATE SKIP LOCKED` in its tenant's transaction), renders, uploads and records the
  hashes. A dossier is never regenerated in place: a new request is a new dossier.
- **Storage:** the module's own S3-compatible client (`SPEED_STORAGE_*`, the pattern of AR's storage service) with no
  database fallback: without storage configured, generation answers 503 `SPEED_STORAGE_UNAVAILABLE`. Downloads stream
  through the module after recomputing the SHA-256 of the stored object; a mismatch answers 409 and is audited.
- **Libraries:** `docx` (MIT) and `pdfkit` (MIT, already used by AR), for `licence_ip_reviewer`.

## Built (2026-10-21, `32c010a1` on `feat/speed-s3-module`)

- **Domain package** `@gigalibs/process-safety-screening-domain`: the catalogue (moved from the web package, which
  re-exports it), the engines' view of the stored sets, `dossierModel` (the eight sections; actions and Stage 2 from
  `actionList` and `stage2Plan`; a substance charged twice in one step is named with its role) and `routeCsv` (RFC 4180;
  a name a spreadsheet would read as a formula is kept as text).
- **Data (forward migration 000005):** `dossiers` (queued, running, done or failed; the model as requested; each file's
  key, SHA-256 and size; a version per status change); a finished dossier never changes and none is deleted (trigger);
  `list_dossier_tenants`, the worker's only cross-tenant read, SECURITY DEFINER like the relays' functions.
- **API:** `POST routes/{id}/dossiers` (202, idempotent; 503 `SPEED_STORAGE_UNAVAILABLE` without the store; 409
  `SPEED_DOSSIER_STALE` when the steps' results used different criteria or library sets), list, get,
  `GET dossiers/{id}/files/docx|pdf` (streamed after its SHA-256 is recomputed; 409 `SPEED_DOSSIER_INTEGRITY` on a
  mismatch; served and refused files are audited), `GET routes/{id}/export/json|csv`; all `speed.routes.read` (plan
  v1.4 §4.4). Downloads are audited without an outbox fact (a read changes no record).
- **Worker:** claims a tenant's oldest queued dossier with `FOR UPDATE SKIP LOCKED`, renders DOCX (`docx`, the
  watermark in every page header) and PDF (`pdfkit` with DejaVu Sans, the watermark across and atop every page, table
  headers repeated), uploads each attempt under its own key, records the hashes; a failed attempt is queued again, the
  third fails the dossier (`SPEED_DOSSIER_RENDER_FAILED`); a dossier whose worker stopped is claimed again after 5
  minutes. `SPEED_DOSSIER_WORKER_DISABLED`, `SPEED_DOSSIER_WORKER_INTERVAL_MS`; idle without `SPEED_STORAGE_*`.
- **Screens:** panel `speed.dossier-preview` on the route's Dossier tab (position 6; 5 is kept for S8): the draft
  banner, Generate, the files with their SHA-256 and download links, Export JSON and CSV, and the preview of the same
  model; `pollSeconds` and `historyCount` come from the dictionary.
- **Fixed on the way:** "Library v{version}" printed "vprototype-0.1" for a named version; the catalogue now prints the
  label as entered.

## Done when

- [x] FR-RPT-01 to 04: the model's eight sections from stored results; actions and Stage 2 texts from the catalogue
      (`dossier.test.ts`; the reference route through the API in `dossiers.integration.test.ts`, TC-11 among its
      actions).
- [x] The files open (the DOCX is a valid package; the PDF parses; the reference route's dossier, 4 pages, was rendered
      and read page by page) and carry the watermark on every page while not approved (`render.test.ts`: every DOCX
      header; the rotated watermark on every PDF page).
- [x] The hash matches on download; a changed object is refused (409) and audited, against a throwaway MinIO; two
      workers never render one dossier; a worker whose lease ran out records nothing (the test fails without the guard).
- [x] Conversion check (5 windows, 5 record types), static conformance 15/15, design tokens pass; `pnpm verify`: build
      and every audit pass, 3271 tests pass; it fails only where the base commit fails (Finance's window from
      `b85a4244`; two Playground tests that need `CONTROL_PAYLOAD_KEY_VERSION`). After it, only the worker's attempt
      guard and its test changed; the 193 SPEED and engine tests and conformance were run again and pass. 143 SPEED
      tests (60 unit, 53 PostgreSQL of which 11 with MinIO, 30 panel renders). Not checked in a browser (as S5 and S6).
- [x] Card and `.pi/NOW.md` updated; committed on the owner's "commit".

## Stop and ask if

- adding `docx` from the npm registry is not acceptable (the alternative is writing the OOXML package by hand);
- the compose wiring of `SPEED_STORAGE_*` for the module host is needed before S9 (it is deployment configuration).
  Not wired in this slice: without it, generation answers 503 and the worker stays idle.

## Notes

- `list_dossier_tenants` relies on its owner reading past the forced row-level security, exactly as the relays'
  definer functions do (the migration owner); the proof ran as the PostgreSQL superuser.
- Generating needs only `speed.routes.read`, as plan v1.4 §4.4 lists; QA and safety reviewers can generate.
- Next (owner, 2026-10-21): SPEED as its own expandable sidebar section like EAM (WI-OI-120cb, proposed).
