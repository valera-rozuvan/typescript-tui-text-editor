#!/usr/bin/env node
/**
 * Test runner for the node-text-editor unit tests.
 *
 * Usage:
 *   node unit-tests/runner.mjs                          # sequential
 *   node unit-tests/runner.mjs --parallel               # parallel, auto thread count
 *   node unit-tests/runner.mjs --parallel --threads 4   # parallel, 4 threads
 *
 * Each test file in unit-tests/dist/tests/*.test.js must export:
 *   export const suite = 'SuiteName';          // display name
 *   export const tests = [                     // array of test cases
 *     { name: 'description', fn: () => {} },  // fn may be async
 *   ];
 *
 * This file doubles as the worker script: when loaded by a worker_threads
 * Worker it detects !isMainThread and runs the assigned test file.
 */

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { readdir } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import os from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// ── Worker mode ───────────────────────────────────────────────────────────────
if (!isMainThread) {
  const { testFile } = workerData;
  try {
    const mod  = await import(testFile);
    const suite = mod.suite ?? testFile;
    const tests = mod.tests ?? [];
    const results = [];

    for (const test of tests) {
      try {
        await test.fn();
        results.push({ name: test.name, passed: true });
      } catch (err) {
        results.push({ name: test.name, passed: false, error: err.message });
      }
    }

    parentPort.postMessage({ suite, results });
  } catch (err) {
    parentPort.postMessage({ suite: testFile, results: [], fatalError: err.message });
  }
}

// ── Main thread ───────────────────────────────────────────────────────────────
else {
  const args      = process.argv.slice(2);
  const parallel  = args.includes('--parallel');
  const tIdx      = args.indexOf('--threads');
  const threads   = tIdx !== -1
    ? Math.max(1, parseInt(args[tIdx + 1]) || os.availableParallelism())
    : os.availableParallelism();

  const testsDir  = join(__dirname, 'dist');
  const entries   = await readdir(testsDir);
  const testFiles = entries
    .filter(f => f.endsWith('.test.js'))
    .sort()
    .map(f => pathToFileURL(resolve(join(testsDir, f))).href);

  if (testFiles.length === 0) {
    console.log('No test files found in', testsDir);
    process.exit(0);
  }

  const modeLabel = parallel ? `parallel (${threads} threads)` : 'sequential';
  console.log(`\nRunning ${testFiles.length} test suite(s) — ${modeLabel}\n`);

  const allResults = parallel
    ? await runParallel(testFiles, threads)
    : await runSequential(testFiles);

  let totalPassed = 0;
  let totalFailed = 0;

  for (const { suite, results, fatalError } of allResults) {
    const name = String(suite).replace(/.*\/dist\//, '').replace('.test.js', '');

    if (fatalError) {
      console.log(`  ✗ ${name}`);
      console.log(`      FATAL: ${fatalError}`);
      totalFailed++;
      continue;
    }

    const passed = results.filter(r => r.passed).length;
    const failed = results.length - passed;
    const mark   = failed === 0 ? '✓' : '✗';
    console.log(`  ${mark} ${name} (${passed}/${results.length})`);

    for (const r of results) {
      if (!r.passed) {
        console.log(`      FAIL: ${r.name}`);
        console.log(`            ${r.error}`);
      }
    }

    totalPassed += passed;
    totalFailed += failed;
  }

  const total = totalPassed + totalFailed;
  console.log(`\n${total} tests: ${totalPassed} passed, ${totalFailed} failed\n`);
  process.exit(totalFailed > 0 ? 1 : 0);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function runInWorker(testFile) {
  return new Promise((resolve) => {
    const worker = new Worker(__filename, { workerData: { testFile } });
    worker.once('message', resolve);
    worker.once('error', (err) =>
      resolve({ suite: testFile, results: [], fatalError: err.message })
    );
  });
}

async function runSequential(testFiles) {
  const results = [];
  for (const f of testFiles) results.push(await runInWorker(f));
  return results;
}

function runParallel(testFiles, maxThreads) {
  return new Promise((resolve) => {
    const results  = new Array(testFiles.length);
    const queue    = testFiles.map((file, idx) => ({ file, idx }));
    let active     = 0;
    let completed  = 0;

    function startNext() {
      while (active < maxThreads && queue.length > 0) {
        const { file, idx } = queue.shift();
        active++;
        runInWorker(file).then(result => {
          results[idx] = result;
          active--;
          completed++;
          if (completed === testFiles.length) resolve(results);
          else startNext();
        });
      }
    }

    startNext();
  });
}
