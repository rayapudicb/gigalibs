#!/usr/bin/env bash
# WI-OI-120cc (SPEED S9a): refresh source identity and image tags in the .env.speed-lab* files.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export GIGALIBS_COMPOSE_ENV_SUFFIX=.speed-lab
bash "${SCRIPT_DIR}/refresh-source-identity.sh"
