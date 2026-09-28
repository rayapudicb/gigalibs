#!/bin/bash
# GigaLibs — start control plane (Docker + NestJS on port 3333)
# Double-click in Finder, or run:  ./start-dev.command

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

# ── Find pnpm ──────────────────────────────────────────────
source ~/.zshrc 2>/dev/null || source ~/.zprofile 2>/dev/null || true

for candidate in \
  "$(command -v pnpm 2>/dev/null)" \
  "$HOME/.local/share/pnpm/pnpm" \
  "$HOME/.pnpm/pnpm" \
  "/opt/homebrew/bin/pnpm" \
  "/usr/local/bin/pnpm"
do
  [ -x "$candidate" ] && { PNPM="$candidate"; break; }
done

if [ -z "${PNPM:-}" ]; then
  echo "❌  pnpm not found."
  echo "    Fix: npm install -g pnpm@11  (or corepack enable)"
  read -n 1 -r -p "Press any key..."; exit 1
fi
echo "✓  pnpm: $PNPM"

# ── Docker + Postgres ───────────────────────────────────────
if ! docker info &>/dev/null; then
  echo "▶  Opening Docker Desktop…"
  open -a "Docker Desktop" 2>/dev/null || open -a "Docker" 2>/dev/null
  echo -n "   Waiting"
  for i in $(seq 1 45); do
    sleep 1; printf "."
    docker info &>/dev/null && { echo " ✓"; break; }
  done; echo ""
fi

echo "▶  Starting supporting containers (Redis:6381, MinIO:9010, execution services)…"
"$PNPM" run docker:dev || {
  echo "❌  Supporting containers did not start."
  read -n 1 -r -p "Press any key..."; exit 1
}

# The active, migrated local control-plane database is the dedicated Homebrew
# PostgreSQL database below. Do not report the app as ready when only the
# unrelated Docker port is available.
if command -v pg_isready &>/dev/null; then
  if ! pg_isready -h 127.0.0.1 -p 5432 -d gigalibs_dev_runtime &>/dev/null; then
    echo "❌  Control-plane PostgreSQL is not ready at 127.0.0.1:5432/gigalibs_dev_runtime."
    read -n 1 -r -p "Press any key..."; exit 1
  fi
  echo "✓  Control-plane PostgreSQL is ready"
fi

# ── Control plane ───────────────────────────────────────────
echo ""
echo "▶  Starting playground-api (port 3333) in a new Terminal tab…"
osascript <<APPLES
tell application "Terminal"
  do script "cd '$SCRIPT_DIR' && $PNPM --filter @gigalibs/playground-api dev"
  activate
end tell
APPLES

echo -n "   Waiting for API readiness"
API_READY="false"
for i in $(seq 1 30); do
  sleep 1
  printf "."
  if curl -fsS http://127.0.0.1:3333/api/v1/ready &>/dev/null; then
    API_READY="true"
    break
  fi
done
echo ""

if [ "$API_READY" != "true" ]; then
  echo "❌  API did not become ready on port 3333. Check the new Terminal tab."
  read -n 1 -r -p "Press any key..."; exit 1
fi

echo "✓  Control plane is database-ready on port 3333."
echo "   Reload: http://localhost:5180/login"
