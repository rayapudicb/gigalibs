# WI-OI-101 — Local build disk guard

Status: Review. Requested by the owner 2026-09-28 ("how can we stop accumulating images and cache").  
Owner: Developer Platform  
Requirements: NFR-OPS-001–004, NFR-REL-001–003  
Independent reviewers: SRE, QA/SDET

## Problem

Every build creates new `gigalibs/*` image tags (one per source identity) and more build cache. Docker keeps
both until someone removes them:

- 2026-09-26: about 10 build cycles grew Docker to about 400 GB and left 119 MB free on the 460 GB disk.
- 2026-09-28: the disk hit 340 MB free during the WI-OI-083 build. The Docker daemon then stopped responding
  and Docker Desktop had to be restarted. The Docker data folder was 175 GB. Clearing the build cache freed
  159 GB.

Docker's own cache limit (`builder.gc.defaultKeepStorage: 20GB`) was already set, but the cache still reached
171 GB.

## Change

- `infra/compose/scripts/docker-disk-guard.sh`:
  - `check`: stops the build if the disk holding the repo has less than `GIGALIBS_MIN_FREE_GB` free
    (default 60). It runs `prune` first and waits up to 60 s for Docker Desktop to hand the space back.
  - `prune [--dry-run]`: removes superseded `gigalibs/*` images and trims the build cache to
    `GIGALIBS_BUILD_CACHE_MAX` (default 20 GB) with `docker buildx prune --max-used-space`, without `--all`.
  - Kept: every image a running or stopped container uses, the newest `GIGALIBS_KEEP_IMAGE_VERSIONS` tags of
    each repository by creation time (default 2: current and rollback), and every image outside `gigalibs/*`
    (including the pinned base images). Volumes are never touched.
  - After the cache trim it checks the kept tags and the pinned base images still exist and warns if not. On
    2026-09-28 three unused rollback images disappeared during a full `docker builder prune -a`; the cause is
    not confirmed.
- The four build scripts (`build-images.sh`, `build-workforce-image.sh`, `build-module-images.sh`,
  `build-geospatial-image.sh`) call `docker-disk-guard.sh check` first.
- `infra/compose/README.md`: new "Disk space" section.
- Outside the repo (owner-approved 2026-09-28): Docker Desktop's `~/.docker/daemon.json` now sets
  `builder.gc` to `defaultMaxUsedSpace: 30GB` and `defaultReservedSpace: 10GB`, replacing
  `defaultKeepStorage: 20GB`.
  - Why: `docker buildx inspect desktop-linux` showed that BuildKit v0.25 treats the old value as a minimum to
    keep ("Reserved Space 20GiB"). Rules 1–3 had no maximum, so garbage collection never started. That is how
    the cache reached 171 GB.
  - After the restart, every rule shows "Max Used Space: 30GiB".
  - The same 16 containers came back, and API and web `/ready` returned 200.
  - The previous file is kept in the session scratchpad as `daemon.json.bak`.

## Evidence (2026-09-28, local)

- `bash -n` passes for all five scripts. shellcheck is not installed on this machine.
- `prune --dry-run` on the real image set: 0 to remove (each repository had at most 2 tags or they were in use).
- Test images `gigalibs/disk-guard-test`, removed afterwards:
  - Seven tags: four with no date and three dated in the opposite order to their names.
  - One stopped container used `v1`.
  - A real `prune` kept `m-new` and `a-mid` (the two newest by date) and `v1` (in use). It removed `z-old`,
    `v4`, `v3` and `v2`, and left the 10 real `gigalibs/*` images alone.
- `check` with 195 GB free passed. With `GIGALIBS_MIN_FREE_GB=100000` it pruned, waited, then exited 1 with
  the error message.
- `build-images.sh` prints the guard result before its source-identity check.

## Not done / open

- Deploy is not scripted, so nothing runs `prune` automatically after a healthy deploy. The build-time
  `check` covers low disk, and the cleanup step after deploy is in the README.
- The next real build has not yet run with the guard, and the new Docker cache limit has not yet been seen to
  hold. Record both after the next WI-OI-083 build.
- Docker Desktop has no virtual-disk cap. Lowering it can recreate the disk and delete all volumes. Back up
  `gigalibs-postgres` first; this is deferred and needs the owner's approval.
