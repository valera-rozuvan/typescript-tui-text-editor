#!/usr/bin/env bash
set -euo pipefail

FILE="dist/index.js"
SHEBANG="#!/usr/bin/env node"

if [[ ! -f "$FILE" ]]; then
  echo "Error: $FILE not found. Run 'npm run build' first." >&2
  exit 1
fi

if [[ "$(head -1 "$FILE")" != "$SHEBANG" ]]; then
  tmp=$(mktemp)
  { echo "$SHEBANG"; cat "$FILE"; } > "$tmp"
  mv "$tmp" "$FILE"
fi

chmod +x "$FILE"
