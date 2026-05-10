#!/usr/bin/env bash
# Run all unit and UI test commands, then print a combined summary.
set -uo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

commands_run=0
commands_passed=0
commands_failed=0

# Run one test command; track pass/fail without aborting on failure.
run_command() {
    local label="$1"
    shift
    printf '\n'
    printf '════════════════════════════════════════════════════════\n'
    printf ' %s\n' "$label"
    printf '════════════════════════════════════════════════════════\n'
    commands_run=$((commands_run + 1))
    if "$@" ; then
        commands_passed=$((commands_passed + 1))
        printf "${GREEN}✓ PASSED${NC}: %s\n" "$label"
    else
        commands_failed=$((commands_failed + 1))
        printf "${RED}✗ FAILED${NC}: %s\n" "$label"
    fi
}

cd /app

run_command "unit tests — sequential"  node unit-tests/runner.mjs
run_command "unit tests — parallel"    node unit-tests/runner.mjs --parallel
run_command "UI tests — all suites"    node ui-tests/runner.mjs --no-build

printf '\n'
printf '════════════════════════════════════════════════════════\n'
printf "${BOLD}FINAL SUMMARY${NC}\n"
printf '════════════════════════════════════════════════════════\n'
printf 'Commands run:    %d\n' "$commands_run"
printf "${GREEN}Commands passed: %d${NC}\n" "$commands_passed"
printf "${RED}Commands failed: %d${NC}\n" "$commands_failed"
printf '════════════════════════════════════════════════════════\n'

if [ "$commands_failed" -eq 0 ]; then
    printf "${GREEN}${BOLD}All commands passed.${NC}\n"
    exit 0
else
    printf "${RED}${BOLD}%d command(s) failed.${NC}\n" "$commands_failed"
    exit 1
fi
