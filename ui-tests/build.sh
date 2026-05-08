#!/usr/bin/env bash
# ui-tests/build.sh — build the N-API PTY addon and compile TypeScript tests.
#
# Run from anywhere; the script resolves its own location.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PTY_DIR="$SCRIPT_DIR/pty"

# ── 1. Build the N-API PTY addon ────────────────────────────────────────────
echo "Building N-API PTY addon ..."
cd "$PTY_DIR"
npx --yes node-gyp configure 2>&1
npx --yes node-gyp build     2>&1
echo "  → built: $PTY_DIR/build/Release/pty_native.node"

# ── 2. Compile TypeScript tests ──────────────────────────────────────────────
echo "Compiling TypeScript tests ..."
cd "$SCRIPT_DIR"
npx tsc -p tsconfig.json
echo "  → compiled to: $SCRIPT_DIR/dist/"

echo ""
echo "Build complete.  Run tests with:"
echo "  node ui-tests/runner.mjs --no-build"
echo "or simply:"
echo "  node ui-tests/runner.mjs"
