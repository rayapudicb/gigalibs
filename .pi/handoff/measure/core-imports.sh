#!/usr/bin/env bash
# For each core package, count source files in the running apps that import it, and the package's source lines.
cd ~/dev/gigalibs
dirs=(apps/playground-api/src apps/workflow-platform/app apps/workflow-platform/components apps/workflow-platform/lib apps/workflow-platform/hooks)
for d in modules/{physical-operations-cmms,geospatial,analytics-studio,universal-connector-hub,gigaops}/apps/*/src; do dirs+=("$d"); done
node -e 'console.log(require("./config/package-layers.json").core.join("\n"))' | while read -r dir; do
  name="$(node -e "console.log(require('./$dir/package.json').name)")"
  n=$(grep -rlE "['\"]${name}(/[^'\"]*)?['\"]" "${dirs[@]}" 2>/dev/null | grep -v node_modules | wc -l | tr -d ' ')
  lines=$(find "$dir/src" -type f \( -name '*.ts' -o -name '*.tsx' \) ! -name '*.test.*' ! -name '*.spec.*' 2>/dev/null | xargs cat 2>/dev/null | wc -l | tr -d ' ')
  printf '%s\t%s\t%s\n' "${dir#packages/}" "$n" "$lines"
done
