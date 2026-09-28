#!/usr/bin/env bash
set -euo pipefail

echo "========================================================"
echo "GigaLibs Accounts Receivable: Prerequisite Check"
echo "========================================================"

MIN_CPUS=2
MIN_MEM_GB=4

# 1. Check docker
if ! command -v docker &> /dev/null; then
  echo "❌ Docker is not installed or not in PATH." >&2
  exit 1
fi
echo "✅ Docker binary located: $(which docker)"

# 2. Check docker daemon connectivity
if ! docker info &> /dev/null; then
  echo "❌ Docker daemon is not running or accessible by current user." >&2
  exit 1
fi
echo "✅ Docker daemon is running"

# 3. Check docker compose
if ! docker compose version &> /dev/null; then
  echo "❌ docker compose v2 is required but not found." >&2
  exit 1
fi
COMPOSE_VERSION=$(docker compose version --short 2>/dev/null || docker compose version)
echo "✅ Docker compose available: ${COMPOSE_VERSION}"

# 4. Check available CPU
CPUS=$(getconf _NPROCESSORS_ONLN 2>/dev/null || nproc 2>/dev/null || echo 1)
if (( CPUS < MIN_CPUS )); then
  echo "⚠️ Warning: Detected ${CPUS} CPUs. Minimum recommended: ${MIN_CPUS} CPUs."
else
  echo "✅ CPU count sufficient: ${CPUS} cores"
fi

# 5. Check memory
TOTAL_MEM_BYTES=0
if [[ "$OSTYPE" == "darwin"* ]]; then
  TOTAL_MEM_BYTES=$(sysctl -n hw.memsize 2>/dev/null || echo 0)
elif [[ -f /proc/meminfo ]]; then
  TOTAL_MEM_KB=$(grep MemTotal /proc/meminfo | awk '{print $2}')
  TOTAL_MEM_BYTES=$(( TOTAL_MEM_KB * 1024 ))
fi
TOTAL_MEM_GB=$(( TOTAL_MEM_BYTES / 1024 / 1024 / 1024 ))
if (( TOTAL_MEM_GB < MIN_MEM_GB )); then
  echo "⚠️ Warning: Detected ${TOTAL_MEM_GB} GB RAM. Minimum recommended: ${MIN_MEM_GB} GB."
else
  echo "✅ Memory capacity sufficient: ${TOTAL_MEM_GB} GB"
fi

echo "========================================================"
echo "All mandatory system prerequisites passed."
echo "========================================================"
exit 0
