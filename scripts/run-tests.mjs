// scripts/run-tests.mjs — cross-platform replacement for run-tests.sh
// Runs all unit and UI test commands, then prints a combined summary.
import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const GREEN = '\x1b[0;32m';
const RED   = '\x1b[0;31m';
const BOLD  = '\x1b[1m';
const NC    = '\x1b[0m';

let commandsRun    = 0;
let commandsPassed = 0;
let commandsFailed = 0;

function runCommand(label, args) {
  console.log('');
  console.log('════════════════════════════════════════════════════════');
  console.log(` ${label}`);
  console.log('════════════════════════════════════════════════════════');
  commandsRun += 1;
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', cwd: root });
  if (result.status === 0) {
    commandsPassed += 1;
    console.log(`${GREEN}✓ PASSED${NC}: ${label}`);
  } else {
    commandsFailed += 1;
    console.log(`${RED}✗ FAILED${NC}: ${label}`);
  }
}

runCommand('unit tests — sequential', ['unit-tests/runner.mjs']);
runCommand('unit tests — parallel',   ['unit-tests/runner.mjs', '--parallel']);
runCommand('UI tests — all suites',   ['ui-tests/runner.mjs', '--no-build']);

console.log('');
console.log('════════════════════════════════════════════════════════');
console.log(`${BOLD}FINAL SUMMARY${NC}`);
console.log('════════════════════════════════════════════════════════');
console.log(`Commands run:    ${commandsRun}`);
console.log(`${GREEN}Commands passed: ${commandsPassed}${NC}`);
console.log(`${RED}Commands failed: ${commandsFailed}${NC}`);
console.log('════════════════════════════════════════════════════════');

if (commandsFailed === 0) {
  console.log(`${GREEN}${BOLD}All commands passed.${NC}`);
  process.exit(0);
} else {
  console.log(`${RED}${BOLD}${commandsFailed} command(s) failed.${NC}`);
  process.exit(1);
}
