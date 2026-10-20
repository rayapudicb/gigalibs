# WI-OI-120bt: SPEED screen specifications (S3–S7, R2 notes)

- **Status:** Built 2026-10-20 (owner: "start SPEED screen specs"). Documentation only; no code.
- **Work item:** WI-OI-120bn, the "Design (no code)" track of `docs/pharma/speed/SPEED-Stage1-Implementation-Plan.md`
  §5.3. Role: `product_designer`, with `design_system` (tokens) and `content_design` (messages).
- **Output:** `docs/pharma/speed/SPEED-Stage1-Screen-Specifications.md` and `.docx`.

## Scope

Every screen of the clickable mock, turned into exact GigaLibs window and panel definitions: windows and tabs, fields,
registered panels with typed props (WI-OI-120bs), permissions, actions, every state, the message catalogue for the
engine codes (WI-OI-120br), token mapping, accessibility and acceptance checks per slice.

## Done when

- [x] Each mock screen has a specification or is listed as dropped, with the reason.
- [x] Every panel names its component key, binding and typed props, so S3 can register them in `spec.ui.panels`.
- [x] Every engine code has its message; every colour has a `ui-*` token and a text label.
- [ ] Reviewed by the owner (and, before release, by the process safety specialist for the class-action texts).
