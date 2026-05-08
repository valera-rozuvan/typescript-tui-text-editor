#!/usr/bin/env node
/*
 * ui-tests/runner.mjs — orchestrator for the end-to-end UI test suite.
 *
 * Usage:
 *   node ui-tests/runner.mjs            # compile + run
 *   node ui-tests/runner.mjs --no-build # skip TypeScript compilation
 */

import { execSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const skipBuild = args.includes('--no-build');

/* ── compile TypeScript ────────────────────────────────────────────────────── */
if (!skipBuild) {
  process.stdout.write('Compiling TypeScript tests ... ');
  try {
    execSync('npx tsc -p tsconfig.json', { cwd: __dirname, stdio: 'pipe' });
    console.log('done');
  } catch (err) {
    console.error('FAILED');
    const output = err.stdout?.toString() || err.stderr?.toString() || String(err);
    console.error(output);
    process.exit(1);
  }
}

/* ── discover test files ───────────────────────────────────────────────────── */
const distDir  = join(__dirname, 'dist');
const entries  = await readdir(distDir);
const testFiles = entries
  .filter(f => f.endsWith('.test.js'))
  .sort()
  .map(f => join(distDir, f));

if (testFiles.length === 0) {
  console.log('No test files found in', distDir);
  process.exit(0);
}

console.log(`\nRunning ${testFiles.length} UI test suite(s) — sequential\n`);

/* ── run suites ────────────────────────────────────────────────────────────── */
let totalPassed = 0;
let totalFailed = 0;

for (const testFile of testFiles) {
  let mod;
  try {
    mod = await import(testFile);
  } catch (err) {
    const name = testFile.replace(/.*\/dist\//, '').replace('.test.js', '');
    console.log(`  ✗ ${name}`);
    console.log(`      FATAL (import): ${err.message}`);
    totalFailed++;
    continue;
  }

  const suiteName = String(mod.suite ?? testFile)
    .replace(/.*\/dist\//, '')
    .replace('.test.js', '');
  const testCases = Array.isArray(mod.tests) ? mod.tests : [];

  let suitePassed = 0;
  let suiteFailed = 0;
  const failures = [];

  for (const tc of testCases) {
    const start = Date.now();
    try {
      await tc.fn();
      suitePassed++;
    } catch (err) {
      suiteFailed++;
      failures.push({ name: tc.name, error: err.message, ms: Date.now() - start });
    }
  }

  const mark = suiteFailed === 0 ? '✓' : '✗';
  console.log(`  ${mark} ${suiteName} (${suitePassed}/${testCases.length})`);
  for (const f of failures) {
    console.log(`      FAIL: ${f.name}`);
    /* Print first 5 lines of the error message to keep output readable */
    const lines = f.error.split('\n').slice(0, 5);
    for (const l of lines) console.log(`            ${l}`);
  }

  totalPassed += suitePassed;
  totalFailed += suiteFailed;
}

const total = totalPassed + totalFailed;
console.log(`\n${total} tests: ${totalPassed} passed, ${totalFailed} failed\n`);
process.exit(totalFailed > 0 ? 1 : 0);
