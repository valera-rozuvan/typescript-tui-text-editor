#!/usr/bin/env bash
# docker-test-all.sh — Remove project Docker images, rebuild each Node.js
# version, run the full test suite, and print a results chart.
# All docker output goes to docker-logs/; the terminal shows only progress.
#
# Usage:  bash docker-test-all.sh
# Exit:   0 when every version passes all tests, 1 otherwise.

set -uo pipefail

# ── configuration ─────────────────────────────────────────────────────────────
VERSIONS=(18 20 22 24 26)
IMAGE_PREFIX="node-text-editor-node-v"
LOG_DIR="docker-logs"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── colors ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

# ── result storage ────────────────────────────────────────────────────────────
declare -A BUILD_STATUS BUILD_SECS RUN_STATUS RUN_SECS CMDS_PASSED CMDS_FAILED

for v in "${VERSIONS[@]}"; do
    BUILD_STATUS[$v]="--"  BUILD_SECS[$v]="n/a"
    RUN_STATUS[$v]="--"    RUN_SECS[$v]="n/a"
    CMDS_PASSED[$v]="--"   CMDS_FAILED[$v]="--"
done

# ── helpers ───────────────────────────────────────────────────────────────────
fmt_time() {
    local s="$1"
    [[ "$s" =~ ^[0-9]+$ ]] || { printf '%s' "$s"; return; }
    printf '%dm%02ds' $(( s / 60 )) $(( s % 60 ))
}

sep() { printf '════════════════════════════════════════════════════════\n'; }

strip_ansi() { sed $'s/\033\[[0-9;]*m//g'; }

# Run "$@" silently (stdout+stderr → $log). Show a live elapsed-time counter
# on the current terminal line via \r. Sets _elapsed (seconds). Returns exit code.
_elapsed=0
run_timed() {
    local label="$1" log="$2"; shift 2
    local t0; t0=$(date +%s)

    { while true; do
        printf '\r  %-36s  %-8s' "$label" "$(fmt_time $(( $(date +%s) - t0 )))"
        sleep 1
    done; } &
    local tid=$!

    "$@" > "$log" 2>&1
    local rc=$?

    kill "$tid" 2>/dev/null
    wait "$tid" 2>/dev/null
    _elapsed=$(( $(date +%s) - t0 ))
    return $rc
}

# ── guard ─────────────────────────────────────────────────────────────────────
if ! command -v docker > /dev/null 2>&1; then
    printf "${RED}Error:${NC} docker not found in PATH.\n" >&2; exit 1
fi

cd "$SCRIPT_DIR"
mkdir -p "$LOG_DIR"

# ── step 1: remove existing project images ────────────────────────────────────
printf '\n'
sep
printf "${BOLD} Clearing project Docker images${NC}\n"
sep
for v in "${VERSIONS[@]}"; do
    img="${IMAGE_PREFIX}${v}"
    if docker image inspect "$img" > /dev/null 2>&1; then
        printf '  Removing %-34s ...' "$img"
        docker rmi "$img" > /dev/null 2>&1 \
            && printf ' done\n' \
            || printf ' skipped (in use)\n'
    else
        printf '  %-36s not present\n' "$img"
    fi
done

# ── step 2: build and test each version ───────────────────────────────────────
printf '\n'
sep
printf "${BOLD} Building and testing all versions${NC}\n"
sep
printf '\n'

for v in "${VERSIONS[@]}"; do
    img="${IMAGE_PREFIX}${v}"
    build_log="${LOG_DIR}/build_v${v}.log"
    run_log="${LOG_DIR}/run_v${v}.log"

    # build
    if run_timed "build  Dockerfile_v${v}" "$build_log" \
            docker build -f "Dockerfile_v${v}" -t "$img" .; then
        BUILD_STATUS[$v]="PASS"
        BUILD_SECS[$v]=$_elapsed
        printf '\r  %-36s  %-8s  '"${GREEN}PASS${NC}"'\n' \
            "build  Dockerfile_v${v}" "$(fmt_time $_elapsed)"
    else
        BUILD_STATUS[$v]="FAIL"
        BUILD_SECS[$v]=$_elapsed
        printf '\r  %-36s  %-8s  '"${RED}FAIL${NC}"'  → %s\n' \
            "build  Dockerfile_v${v}" "$(fmt_time $_elapsed)" "$build_log"
        printf '\n'
        continue
    fi

    # test
    if run_timed "test   Dockerfile_v${v}" "$run_log" \
            docker run --rm "$img"; then
        RUN_STATUS[$v]="PASS"
    else
        RUN_STATUS[$v]="FAIL"
    fi
    RUN_SECS[$v]=$_elapsed

    clean=$(strip_ansi < "$run_log")
    p=$(printf '%s\n' "$clean" | grep "Commands passed:" | grep -oE '[0-9]+' | head -1)
    f=$(printf '%s\n' "$clean" | grep "Commands failed:" | grep -oE '[0-9]+' | head -1)
    CMDS_PASSED[$v]="${p:-?}"
    CMDS_FAILED[$v]="${f:-?}"

    total_cmds="?"
    [[ "${p:-}" =~ ^[0-9]+$ && "${f:-}" =~ ^[0-9]+$ ]] && total_cmds=$(( p + f ))

    if [[ "${RUN_STATUS[$v]}" == "PASS" ]]; then
        printf '\r  %-36s  %-8s  '"${GREEN}PASS${NC}"'  %s/%s cmds\n' \
            "test   Dockerfile_v${v}" "$(fmt_time $_elapsed)" "${p:-?}" "$total_cmds"
    else
        printf '\r  %-36s  %-8s  '"${RED}FAIL${NC}"'  %s/%s cmds  → %s\n' \
            "test   Dockerfile_v${v}" "$(fmt_time $_elapsed)" "${p:-?}" "$total_cmds" "$run_log"
    fi
    printf '\n'
done

# ── step 3: summary chart ─────────────────────────────────────────────────────
total_pass=0
total_fail=0
for v in "${VERSIONS[@]}"; do
    if [[ "${BUILD_STATUS[$v]}" == "PASS" && "${RUN_STATUS[$v]}" == "PASS" ]]; then
        total_pass=$(( total_pass + 1 ))
    else
        total_fail=$(( total_fail + 1 ))
    fi
done

sep
printf "${BOLD} RESULTS SUMMARY${NC}\n"
sep
printf '\n'

printf '  %-9s  %-8s  %-12s  %-8s  %-13s  %-12s\n' \
    "Node.js" "Build" "Build time" "Tests" "Cmds passed" "Cmds failed"
printf '  %-9s  %-8s  %-12s  %-8s  %-13s  %-12s\n' \
    "---------" "--------" "------------" "--------" "-------------" "------------"
for v in "${VERSIONS[@]}"; do
    printf '  %-9s  %-8s  %-12s  %-8s  %-13s  %-12s\n' \
        "v${v}" \
        "${BUILD_STATUS[$v]}" \
        "$(fmt_time "${BUILD_SECS[$v]}")" \
        "${RUN_STATUS[$v]}" \
        "${CMDS_PASSED[$v]}" \
        "${CMDS_FAILED[$v]}"
done

printf '\n'
printf '  Versions tested:     %d\n' "${#VERSIONS[@]}"
if [[ "$total_fail" -eq 0 ]]; then
    printf "  ${GREEN}${BOLD}Versions all-pass:    %d${NC}\n" "$total_pass"
    printf '  Versions with fails: 0\n'
else
    printf '  Versions all-pass:   %d\n' "$total_pass"
    printf "  ${RED}${BOLD}Versions with fails:  %d${NC}\n" "$total_fail"
fi
printf '\n'
sep

if [[ "$total_fail" -eq 0 ]]; then
    printf "${GREEN}${BOLD}All versions passed all tests.${NC}\n"
    exit 0
else
    printf "${RED}${BOLD}%d version(s) had failures.${NC}\n" "$total_fail"
    exit 1
fi
