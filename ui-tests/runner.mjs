#!/usr/bin/env node
/*
 * ui-tests/runner.mjs — orchestrator for the end-to-end UI test suite.
 *
 * Usage:
 *   node ui-tests/runner.mjs                        # compile + run all suites
 *   node ui-tests/runner.mjs --no-build             # skip TypeScript compilation
 *   node ui-tests/runner.mjs --suite <name>         # run a specific suite
 *   node ui-tests/runner.mjs --debug                # debug all suites
 *   node ui-tests/runner.mjs --debug --suite <name> # debug a specific suite
 *
 * Suite names: startup, text_input, multipane, file_search, project_search,
 *              search_cursor, scroll_rendering, scroll_rendering_c_code,
 *              readonly_file, file_browser, js_transform, tab_navigation
 */

import { execSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const skipBuild = args.includes('--no-build');
const debugMode = args.includes('--debug');

const suiteFilterIdx = args.indexOf('--suite');
const suiteFilter = suiteFilterIdx !== -1 ? (args[suiteFilterIdx + 1] ?? null) : null;

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

/* ── debug server setup ────────────────────────────────────────────────────── */
let debugServer = null;
if (debugMode) {
  const { DebugServer } = await import('./dist/DebugServer.js');
  const { setDebugServer } = await import('./dist/debug.js');
  debugServer = new DebugServer();
  await debugServer.start();
  console.log(`\nDebug server: ${debugServer.path}`);
  console.log(`Attach:  node ui-tests/observer.mjs ${debugServer.path}`);
  console.log('\nWaiting for observer to connect...');
  await debugServer.waitForObserver();
  console.log('Observer connected. Starting tests.\n');
  setDebugServer(debugServer);
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

if (suiteFilter) {
  console.log(`\nRunning UI test suite: ${suiteFilter}\n`);
} else {
  console.log(`\nRunning ${testFiles.length} UI test suite(s) — sequential\n`);
}

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

  if (suiteFilter && suiteName !== suiteFilter) continue;

  const testCases = Array.isArray(mod.tests) ? mod.tests : [];

  let suitePassed = 0;
  let suiteFailed = 0;
  const failures = [];

  for (const tc of testCases) {
    const start = Date.now();
    debugServer?.setContext(suiteName, tc.name);
    try {
      await tc.fn();
      suitePassed++;
      debugServer?.notifyTestPass(suiteName, tc.name);
    } catch (err) {
      suiteFailed++;
      failures.push({ name: tc.name, error: err.message, ms: Date.now() - start });
      debugServer?.notifyTestFail(suiteName, tc.name, err.message);
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

if (suiteFilter && totalPassed === 0 && totalFailed === 0) {
  console.error(`No suite named "${suiteFilter}" found.`);
  console.error('Available suites: startup, text_input, multipane, file_search, project_search,');
  console.error('                  search_cursor, scroll_rendering, scroll_rendering_c_code,');
  console.error('                  readonly_file, file_browser, js_transform');
  debugServer?.notifyDone();
  await debugServer?.close();
  process.exit(1);
}

const total = totalPassed + totalFailed;
console.log(`\n${total} tests: ${totalPassed} passed, ${totalFailed} failed\n`);

debugServer?.notifyDone();
await debugServer?.close();

process.exit(totalFailed > 0 ? 1 : 0);
