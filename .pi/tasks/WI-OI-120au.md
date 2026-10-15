# WI-OI-120au: One "Master data" menu, in two sections

- **Status:** Carded (owner, 2026-10-15: "proceed" on the two-level structure). Shown to the owner before it starts.
- **Plan v3:** step 0.8, after WI-OI-120at.
- **Work item:** WI-OI-120. Evidence goes in `.pi/work/WI-OI-120.md`.
- **Size:** S.

## Why

The owner wants master data in one place without a second engine: platform master data, locked, and each module's
master data, edited in its own screen. The menu only leads there; every record keeps one owner.

```
Master data
├─ Platform reference   (read-only here; changed only in Platform Control Tower)
│    Countries · Currencies · Units of measure · Languages & time zones · Tax jurisdictions
└─ Workspace master data   (each link opens the owning module's own screen)
     Parties · Organization & cost centres · Chart of accounts · Catalogue & categories · Price lists · …
```

## Design

1. **Generated from metadata, not hand-written.** Each module manifest marks which of its pages are master data (a
   field on the page in `module.yaml`); the platform's reference pages are marked in `platform/core.yaml`. The menu
   generator (`scripts/module-manifests.mjs`, `lib/generated/module-navigation.ts`) builds the group from those
   marks.
2. **Access:**
   - a link shows only when its module is open to the person (`canOpenPlatformModule`), with no new rule;
   - the platform reference section is read-only for every workspace;
   - its "edit" lives in Platform Control Tower, for platform operators only.
3. **Until WI-OI-120av ships,** the platform section shows only what exists, so no empty or invented entries appear.

## Done when

- [ ] The group appears, built from the manifests, with both sections. Each link opens the owning screen, and only
  for people who may open it.
- [ ] The manifest check and conversion check cover the new field; tests prove that a module's link hides without
  access.
- [ ] Released, reviewed, deployed by the owner; journey rerun.
