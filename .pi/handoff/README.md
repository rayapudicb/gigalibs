# Handoff folder

- `PROMPT.md`: the prompt to paste into the next agent (a summary of the brief).
- `HANDOFF-2026-09-29.md`: the full brief for the next implementation agent: rules, decisions, architecture, current state, tasks with acceptance checks, verification and pitfalls.
- `proof-scripts/`: the live proofs used for WI-OI-083d and WI-OI-085b–e, copied from the Claude session. Each
  script builds a throwaway copy of the working tree under `$PROOF_WORK_DIR`, which must be an empty directory
  outside the repository. They clean up containers, schemas, roles, images and copied secrets whatever happens,
  and never print secret values.
- `core-package-usage.tsv`: the 82 packages labelled `core` in `config/package-layers.json`, measured on
  2026-09-29 for the core package inventory (vision §10). Columns:
  - `used_by`: `api`, `web` and/or `modules` when the core API (`apps/playground-api`), the web
    (`apps/workflow-platform`) or one of the five running modules (CMMS, Workforce/gigaops, Geospatial, Analytics,
    Connector Hub) depends on the package, directly or through other packages. `UNUSED` otherwise.
  - `src_files`, `test_files`: files under the package (tests anywhere in it, sources under `src`).
  - `direct_imports_in_running_apps`: source files in those apps that import the package by name.
  - `source_lines`: non-test TypeScript lines under `src`.

  An unused package does not always mean a missing capability, but the overlap is small. The core API has its own
  forms designer (configuration studio, maker-checker), an approval queue for AP actions only, and workflow
  execution records, none of which use these packages. There is no general approvals, notifications or reports
  engine in the running product. Re-measure with `node .pi/handoff/measure/core-usage.mjs` and
  `bash .pi/handoff/measure/core-imports.sh`, from the repository root.
