import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { searchProject, findProjectRoot } from '../../dist/search/ProjectSearch.js';
import type { ProjectSearchResult } from '../../dist/search/ProjectSearch.js';
import type { TestCase } from './types.js';

export const suite = 'ProjectSearch (extra)';

function makeRoot(setup: (root: string) => void): string {
  const root = mkdtempSync(join(tmpdir(), 'pse-'));
  mkdirSync(join(root, '.git'));
  setup(root);
  return root;
}

export const tests: TestCase[] = [
  // ── Cancellation ─────────────────────────────────────────────────────────────
  {
    name: 'searchProject: cancelled signal before first file causes onResults to not be called',
    fn: async () => {
      const root = makeRoot(r => {
        writeFileSync(join(r, 'a.txt'), 'hello world\n');
        writeFileSync(join(r, 'b.txt'), 'hello again\n');
      });
      try {
        let callCount = 0;
        const signal = { cancelled: true }; // cancelled before start
        await searchProject('hello', root, () => { callCount++; }, signal);
        assert.equal(callCount, 0, 'onResults should not be called when signal is pre-cancelled');
      } finally {
        rmSync(root, { recursive: true });
      }
    },
  },

  // ── Dot-file skipping ────────────────────────────────────────────────────────
  {
    name: 'searchProject: skips files whose names begin with a dot',
    fn: async () => {
      const root = makeRoot(r => {
        writeFileSync(join(r, '.hidden'), 'findme\n');
        writeFileSync(join(r, 'visible.txt'), 'nothing here\n');
      });
      try {
        let results: ProjectSearchResult[] = [];
        const signal = { cancelled: false };
        await searchProject('findme', root, r => { results = r; }, signal);
        assert.equal(results.length, 0, 'dot-files should not appear in results');
      } finally {
        rmSync(root, { recursive: true });
      }
    },
  },
  {
    name: 'searchProject: skips dot-directories and their contents',
    fn: async () => {
      const root = makeRoot(r => {
        mkdirSync(join(r, '.hidden-dir'));
        writeFileSync(join(r, '.hidden-dir', 'file.txt'), 'findme\n');
        writeFileSync(join(r, 'real.txt'), 'nothing\n');
      });
      try {
        let results: ProjectSearchResult[] = [];
        const signal = { cancelled: false };
        await searchProject('findme', root, r => { results = r; }, signal);
        assert.equal(results.length, 0, 'contents of dot-directories should not appear in results');
      } finally {
        rmSync(root, { recursive: true });
      }
    },
  },

  // ── Binary extension filtering ────────────────────────────────────────────────
  {
    name: 'searchProject: skips .png files even if they contain matching text',
    fn: async () => {
      const root = makeRoot(r => {
        writeFileSync(join(r, 'image.png'), 'findme\n');
        writeFileSync(join(r, 'real.txt'), 'nothing\n');
      });
      try {
        let results: ProjectSearchResult[] = [];
        const signal = { cancelled: false };
        await searchProject('findme', root, r => { results = r; }, signal);
        assert.equal(results.length, 0, '.png files should not be searched');
      } finally {
        rmSync(root, { recursive: true });
      }
    },
  },
  {
    name: 'searchProject: skips .lock files',
    fn: async () => {
      const root = makeRoot(r => {
        writeFileSync(join(r, 'package-lock.lock'), 'findme\n');
        writeFileSync(join(r, 'app.js'), 'nothing\n');
      });
      try {
        let results: ProjectSearchResult[] = [];
        const signal = { cancelled: false };
        await searchProject('findme', root, r => { results = r; }, signal);
        assert.equal(results.length, 0, '.lock files should not be searched');
      } finally {
        rmSync(root, { recursive: true });
      }
    },
  },
  {
    name: 'searchProject: skips .wasm files',
    fn: async () => {
      const root = makeRoot(r => {
        writeFileSync(join(r, 'module.wasm'), 'findme\n');
      });
      try {
        let results: ProjectSearchResult[] = [];
        const signal = { cancelled: false };
        await searchProject('findme', root, r => { results = r; }, signal);
        assert.equal(results.length, 0, '.wasm files should not be searched');
      } finally {
        rmSync(root, { recursive: true });
      }
    },
  },

  // ── Skipped directories ───────────────────────────────────────────────────────
  {
    name: 'searchProject: skips dist directory',
    fn: async () => {
      const root = makeRoot(r => {
        mkdirSync(join(r, 'dist'));
        writeFileSync(join(r, 'dist', 'bundle.js'), 'findme\n');
        writeFileSync(join(r, 'src.js'), 'nothing\n');
      });
      try {
        let results: ProjectSearchResult[] = [];
        const signal = { cancelled: false };
        await searchProject('findme', root, r => { results = r; }, signal);
        assert.equal(results.length, 0, 'dist directory should not be searched');
      } finally {
        rmSync(root, { recursive: true });
      }
    },
  },
  {
    name: 'searchProject: skips build directory',
    fn: async () => {
      const root = makeRoot(r => {
        mkdirSync(join(r, 'build'));
        writeFileSync(join(r, 'build', 'out.js'), 'findme\n');
      });
      try {
        let results: ProjectSearchResult[] = [];
        const signal = { cancelled: false };
        await searchProject('findme', root, r => { results = r; }, signal);
        assert.equal(results.length, 0, 'build directory should not be searched');
      } finally {
        rmSync(root, { recursive: true });
      }
    },
  },

  // ── Intermediate callbacks ────────────────────────────────────────────────────
  {
    name: 'searchProject: onResults called at least once on completion',
    fn: async () => {
      const root = makeRoot(r => {
        writeFileSync(join(r, 'a.txt'), 'hello\n');
      });
      try {
        let callCount = 0;
        const signal = { cancelled: false };
        await searchProject('hello', root, () => { callCount++; }, signal);
        assert.ok(callCount >= 1, 'onResults must be called at least once');
      } finally {
        rmSync(root, { recursive: true });
      }
    },
  },
  {
    name: 'searchProject: onResults called multiple times when processing >20 files',
    fn: async () => {
      const root = makeRoot(r => {
        // 25 files → onResults is called once per 20-file batch + once on completion
        for (let i = 0; i < 25; i++) {
          writeFileSync(join(r, `file${i}.txt`), 'findme\n');
        }
      });
      try {
        let callCount = 0;
        const signal = { cancelled: false };
        await searchProject('findme', root, () => { callCount++; }, signal);
        assert.ok(callCount >= 2, `expected multiple onResults calls for 25 files, got ${callCount}`);
      } finally {
        rmSync(root, { recursive: true });
      }
    },
  },
  {
    name: 'searchProject: intermediate results are a subset of final results',
    fn: async () => {
      const root = makeRoot(r => {
        for (let i = 0; i < 25; i++) {
          writeFileSync(join(r, `f${i}.txt`), 'hello\n');
        }
      });
      try {
        const calls: ProjectSearchResult[][] = [];
        const signal = { cancelled: false };
        await searchProject('hello', root, r => { calls.push([...r]); }, signal);
        assert.ok(calls.length >= 2, 'expected at least 2 calls');
        const finalCount = calls[calls.length - 1].length;
        for (let i = 0; i < calls.length - 1; i++) {
          assert.ok(
            calls[i].length <= finalCount,
            `intermediate call ${i} has ${calls[i].length} results but final has ${finalCount}`,
          );
        }
      } finally {
        rmSync(root, { recursive: true });
      }
    },
  },

  // ── findProjectRoot edge cases ────────────────────────────────────────────────
  {
    name: 'findProjectRoot: finds .git from deeply nested subdirectory',
    fn: () => {
      const root = mkdtempSync(join(tmpdir(), 'pse-deep-'));
      try {
        mkdirSync(join(root, '.git'));
        const deep = join(root, 'a', 'b', 'c', 'd');
        mkdirSync(deep, { recursive: true });
        assert.equal(findProjectRoot(deep), root);
      } finally {
        rmSync(root, { recursive: true });
      }
    },
  },
  {
    name: 'findProjectRoot: returns the start dir itself when .git is in start dir',
    fn: () => {
      const root = mkdtempSync(join(tmpdir(), 'pse-self-'));
      try {
        mkdirSync(join(root, '.git'));
        assert.equal(findProjectRoot(root), root);
      } finally {
        rmSync(root, { recursive: true });
      }
    },
  },

  // ── Snippet content ───────────────────────────────────────────────────────────
  {
    name: 'searchProject: snippet is the raw line content (up to 200 chars)',
    fn: async () => {
      const root = makeRoot(r => {
        writeFileSync(join(r, 'code.js'), 'const greeting = "hello world";\n');
      });
      try {
        let results: ProjectSearchResult[] = [];
        const signal = { cancelled: false };
        await searchProject('hello', root, r => { results = r; }, signal);
        assert.ok(results.length > 0, 'expected a result');
        assert.ok(
          results[0].snippet.includes('hello world'),
          `snippet should contain the matched line, got: "${results[0].snippet}"`,
        );
      } finally {
        rmSync(root, { recursive: true });
      }
    },
  },
  {
    name: 'searchProject: result.line is 0-based line number',
    fn: async () => {
      const root = makeRoot(r => {
        writeFileSync(join(r, 'code.js'), 'first line\nhello world\nthird line\n');
      });
      try {
        let results: ProjectSearchResult[] = [];
        const signal = { cancelled: false };
        await searchProject('hello', root, r => { results = r; }, signal);
        const r = results.find(x => x.snippet.includes('hello world'));
        assert.ok(r !== undefined, 'expected a result for "hello world"');
        assert.equal(r!.line, 1, 'line should be 1 (0-based) for the second line');
      } finally {
        rmSync(root, { recursive: true });
      }
    },
  },
];
