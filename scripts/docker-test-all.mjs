// scripts/docker-test-all.mjs — cross-platform replacement for docker-test-all.sh
// Remove project Docker images, rebuild each Node.js version, run the full
// test suite, and print a results chart.
// All docker output goes to docker-logs/; the terminal shows only progress.
//
// Usage:  node scripts/docker-test-all.mjs
//         npm run docker-tests
// Exit:   0 when every version passes all tests, 1 otherwise.

import { spawn, spawnSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const VERSIONS = [18, 20, 22, 24, 26];
const IMAGE_PREFIX = 'node-text-editor-node-v';
const LOG_DIR = 'docker-logs';

const GREEN = '\x1b[0;32m';
const RED   = '\x1b[0;31m';
const BOLD  = '\x1b[1m';
const NC    = '\x1b[0m';

const PROJECT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
process.chdir(PROJECT_ROOT);

function fmtTime(s) {
  if (typeof s !== 'number') return String(s);
  return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`;
}

function sep() {
  process.stdout.write('════════════════════════════════════════════════════════\n');
}

function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function extractNumber(text, label) {
  const m = new RegExp(`${label}\\s*(\\d+)`).exec(text);
  return m ? parseInt(m[1], 10) : null;
}

async function runTimed(label, logFile, cmd, args) {
  const t0 = Date.now();
  let output = '';

  const tick = () => {
    const elapsed = Math.floor((Date.now() - t0) / 1000);
    process.stdout.write(`\r  ${label.padEnd(36)}  ${fmtTime(elapsed).padEnd(8)}`);
  };
  tick();
  const intervalId = setInterval(tick, 1000);

  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    proc.stdout.on('data', (chunk) => { output += chunk.toString(); });
    proc.stderr.on('data', (chunk) => { output += chunk.toString(); });
    proc.on('close', (code) => {
      clearInterval(intervalId);
      const elapsed = Math.floor((Date.now() - t0) / 1000);
      writeFileSync(logFile, output);
      resolve({ code: code ?? 1, elapsed, output });
    });
  });
}

async function main() {
  const dockerCheck = spawnSync('docker', ['--version'], { stdio: 'ignore' });
  if (dockerCheck.error || dockerCheck.status !== 0) {
    process.stderr.write(`${RED}Error:${NC} docker not found in PATH.\n`);
    process.exit(1);
  }

  mkdirSync(LOG_DIR, { recursive: true });

  const results = new Map(VERSIONS.map(v => [v, {
    buildStatus: '--', buildSecs: 'n/a',
    runStatus:   '--', runSecs:   'n/a',
    cmdsPassed:  '--', cmdsFailed: '--',
  }]));

  // ── Step 1: Remove existing project images ──────────────────────────────────
  process.stdout.write('\n');
  sep();
  process.stdout.write(`${BOLD} Clearing project Docker images${NC}\n`);
  sep();

  for (const v of VERSIONS) {
    const img = `${IMAGE_PREFIX}${v}`;
    const inspect = spawnSync('docker', ['image', 'inspect', img], { stdio: 'ignore' });
    if (inspect.status === 0) {
      process.stdout.write(`  Removing ${img.padEnd(34)} ...`);
      const rmi = spawnSync('docker', ['rmi', img], { stdio: 'ignore' });
      process.stdout.write(rmi.status === 0 ? ' done\n' : ' skipped (in use)\n');
    } else {
      process.stdout.write(`  ${img.padEnd(36)} not present\n`);
    }
  }

  // ── Step 2: Build and test each version ─────────────────────────────────────
  process.stdout.write('\n');
  sep();
  process.stdout.write(`${BOLD} Building and testing all versions${NC}\n`);
  sep();
  process.stdout.write('\n');

  for (const v of VERSIONS) {
    const r = results.get(v);
    const img         = `${IMAGE_PREFIX}${v}`;
    const buildLog    = join(LOG_DIR, `build_v${v}.log`);
    const runLog      = join(LOG_DIR, `run_v${v}.log`);
    const buildLabel  = `build  Dockerfile_v${v}`;
    const testLabel   = `test   Dockerfile_v${v}`;

    // Build
    const { code: buildCode, elapsed: buildElapsed } = await runTimed(
      buildLabel, buildLog, 'docker', ['build', '-f', `Dockerfile_v${v}`, '-t', img, '.']
    );

    r.buildSecs = buildElapsed;
    if (buildCode === 0) {
      r.buildStatus = 'PASS';
      process.stdout.write(
        `\r  ${buildLabel.padEnd(36)}  ${fmtTime(buildElapsed).padEnd(8)}  ${GREEN}PASS${NC}\n`
      );
    } else {
      r.buildStatus = 'FAIL';
      process.stdout.write(
        `\r  ${buildLabel.padEnd(36)}  ${fmtTime(buildElapsed).padEnd(8)}  ${RED}FAIL${NC}  → ${buildLog}\n\n`
      );
      continue;
    }

    // Test
    const { code: runCode, elapsed: runElapsed, output: runOutput } = await runTimed(
      testLabel, runLog, 'docker', ['run', '--rm', img]
    );

    r.runStatus = runCode === 0 ? 'PASS' : 'FAIL';
    r.runSecs   = runElapsed;

    const clean = stripAnsi(runOutput);
    const p = extractNumber(clean, 'Commands passed:');
    const f = extractNumber(clean, 'Commands failed:');
    r.cmdsPassed  = p !== null ? String(p) : '?';
    r.cmdsFailed  = f !== null ? String(f) : '?';
    const total   = (p !== null && f !== null) ? String(p + f) : '?';

    if (r.runStatus === 'PASS') {
      process.stdout.write(
        `\r  ${testLabel.padEnd(36)}  ${fmtTime(runElapsed).padEnd(8)}  ${GREEN}PASS${NC}  ${r.cmdsPassed}/${total} cmds\n\n`
      );
    } else {
      process.stdout.write(
        `\r  ${testLabel.padEnd(36)}  ${fmtTime(runElapsed).padEnd(8)}  ${RED}FAIL${NC}  ${r.cmdsPassed}/${total} cmds  → ${runLog}\n\n`
      );
    }
  }

  // ── Step 3: Summary chart ────────────────────────────────────────────────────
  let totalPass = 0;
  let totalFail = 0;
  for (const v of VERSIONS) {
    const r = results.get(v);
    if (r.buildStatus === 'PASS' && r.runStatus === 'PASS') totalPass++;
    else totalFail++;
  }

  sep();
  process.stdout.write(`${BOLD} RESULTS SUMMARY${NC}\n`);
  sep();
  process.stdout.write('\n');

  const col = (s, w) => String(s).padEnd(w);
  process.stdout.write(
    `  ${col('Node.js', 9)}  ${col('Build', 8)}  ${col('Build time', 12)}  ${col('Tests', 8)}  ${col('Cmds passed', 13)}  ${col('Cmds failed', 12)}\n`
  );
  process.stdout.write(
    `  ${col('---------', 9)}  ${col('--------', 8)}  ${col('------------', 12)}  ${col('--------', 8)}  ${col('-------------', 13)}  ${col('------------', 12)}\n`
  );
  for (const v of VERSIONS) {
    const r = results.get(v);
    process.stdout.write(
      `  ${col('v' + v, 9)}  ${col(r.buildStatus, 8)}  ${col(fmtTime(r.buildSecs), 12)}  ${col(r.runStatus, 8)}  ${col(r.cmdsPassed, 13)}  ${col(r.cmdsFailed, 12)}\n`
    );
  }

  process.stdout.write('\n');
  process.stdout.write(`  Versions tested:     ${VERSIONS.length}\n`);
  if (totalFail === 0) {
    process.stdout.write(`  ${GREEN}${BOLD}Versions all-pass:    ${totalPass}${NC}\n`);
    process.stdout.write('  Versions with fails: 0\n');
  } else {
    process.stdout.write(`  Versions all-pass:   ${totalPass}\n`);
    process.stdout.write(`  ${RED}${BOLD}Versions with fails:  ${totalFail}${NC}\n`);
  }
  process.stdout.write('\n');
  sep();

  if (totalFail === 0) {
    process.stdout.write(`${GREEN}${BOLD}All versions passed all tests.${NC}\n`);
    process.exit(0);
  } else {
    process.stdout.write(`${RED}${BOLD}${totalFail} version(s) had failures.${NC}\n`);
    process.exit(1);
  }
}

main();
