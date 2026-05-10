import assert from 'node:assert/strict';
import { writeFile, readFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Buffer } from '../../dist/editor/Buffer.js';
import type { TestCase } from './types.js';

export const suite = 'Buffer (extra)';

export const tests: TestCase[] = [
  // ── toString edge cases ───────────────────────────────────────────────────────
  {
    name: 'toString: empty buffer (one empty line) produces a single newline',
    fn: () => {
      const b = new Buffer();
      assert.equal(b.toString(), '\n');
    },
  },
  {
    name: 'toString: multi-line buffer joins with newline and appends trailing newline',
    fn: () => {
      const b = new Buffer('a\nb\nc');
      assert.equal(b.toString(), 'a\nb\nc\n');
    },
  },
  {
    name: 'toString: single non-empty line produces line + newline',
    fn: () => {
      const b = new Buffer('hello');
      assert.equal(b.toString(), 'hello\n');
    },
  },

  // ── fromFile: file without trailing newline ────────────────────────────────
  {
    name: 'fromFile: file without trailing newline preserves all lines',
    fn: async () => {
      const dir = await mkdtemp(join(tmpdir(), 'buf-notail-'));
      const path = join(dir, 'notail.txt');
      // No trailing newline
      await writeFile(path, 'line1\nline2', 'utf8');
      try {
        const b = await Buffer.fromFile(path);
        assert.equal(b.lineCount, 2);
        assert.equal(b.getLine(0), 'line1');
        assert.equal(b.getLine(1), 'line2');
      } finally {
        await rm(dir, { recursive: true });
      }
    },
  },
  {
    name: 'fromFile: single line without trailing newline is preserved',
    fn: async () => {
      const dir = await mkdtemp(join(tmpdir(), 'buf-single-'));
      const path = join(dir, 'single.txt');
      await writeFile(path, 'only line', 'utf8');
      try {
        const b = await Buffer.fromFile(path);
        assert.equal(b.lineCount, 1);
        assert.equal(b.getLine(0), 'only line');
      } finally {
        await rm(dir, { recursive: true });
      }
    },
  },
  {
    name: 'fromFile: empty file yields a single empty line',
    fn: async () => {
      const dir = await mkdtemp(join(tmpdir(), 'buf-empty-'));
      const path = join(dir, 'empty.txt');
      await writeFile(path, '', 'utf8');
      try {
        const b = await Buffer.fromFile(path);
        assert.equal(b.lineCount, 1);
        assert.equal(b.getLine(0), '');
      } finally {
        await rm(dir, { recursive: true });
      }
    },
  },
  {
    name: 'fromFile: sets filePath on the returned buffer',
    fn: async () => {
      const dir = await mkdtemp(join(tmpdir(), 'buf-path-'));
      const path = join(dir, 'named.txt');
      await writeFile(path, 'content\n', 'utf8');
      try {
        const b = await Buffer.fromFile(path);
        assert.equal(b.filePath, path);
      } finally {
        await rm(dir, { recursive: true });
      }
    },
  },

  // ── save: auto-mkdir ──────────────────────────────────────────────────────────
  {
    name: 'save: creates parent directory when it does not exist',
    fn: async () => {
      const base = await mkdtemp(join(tmpdir(), 'buf-mkdir-'));
      const path = join(base, 'new', 'nested', 'file.txt');
      try {
        const b = new Buffer('content');
        b.filePath = path;
        b.modified = true;
        await b.save();
        const written = await readFile(path, 'utf8');
        assert.equal(written, 'content\n');
      } finally {
        await rm(base, { recursive: true });
      }
    },
  },
  {
    name: 'save: clears modified flag after writing',
    fn: async () => {
      const dir = await mkdtemp(join(tmpdir(), 'buf-mod-'));
      const path = join(dir, 'out.txt');
      try {
        const b = new Buffer('data');
        b.filePath = path;
        b.modified = true;
        assert.equal(b.modified, true);
        await b.save();
        assert.equal(b.modified, false);
      } finally {
        await rm(dir, { recursive: true });
      }
    },
  },
  {
    name: 'save: writes content produced by toString',
    fn: async () => {
      const dir = await mkdtemp(join(tmpdir(), 'buf-content-'));
      const path = join(dir, 'content.txt');
      try {
        const b = new Buffer('alpha\nbeta\ngamma');
        b.filePath = path;
        await b.save();
        const written = await readFile(path, 'utf8');
        assert.equal(written, b.toString());
      } finally {
        await rm(dir, { recursive: true });
      }
    },
  },

  // ── insert: edge cases ────────────────────────────────────────────────────────
  {
    name: 'insert: empty string is a no-op for line content but marks modified',
    fn: () => {
      const b = new Buffer('hello');
      b.insert(0, 2, '');
      assert.equal(b.getLine(0), 'hello');
      // modified is set to true regardless of empty insert
      assert.equal(b.modified, true);
    },
  },
  {
    name: 'insert: multi-character string at col 0 prepends to line',
    fn: () => {
      const b = new Buffer('world');
      b.insert(0, 0, 'hello ');
      assert.equal(b.getLine(0), 'hello world');
    },
  },

  // ── insertNewline: edge cases ─────────────────────────────────────────────────
  {
    name: 'insertNewline: at end of last line adds a new empty line',
    fn: () => {
      const b = new Buffer('hello');
      b.insertNewline(0, 5);
      assert.equal(b.lineCount, 2);
      assert.equal(b.getLine(0), 'hello');
      assert.equal(b.getLine(1), '');
    },
  },
  {
    name: 'insertNewline: carries mixed whitespace (tabs) as indentation',
    fn: () => {
      const b = new Buffer('\thello');
      b.insertNewline(0, 6);
      assert.equal(b.getLine(1), '\t');
    },
  },
  {
    name: 'insertNewline: on out-of-bounds line is a no-op',
    fn: () => {
      const b = new Buffer('hello');
      b.insertNewline(99, 0);
      assert.equal(b.lineCount, 1);
    },
  },

  // ── deleteCharBefore: multi-line merges ───────────────────────────────────────
  {
    name: 'deleteCharBefore: merging last line into previous reduces lineCount by 1',
    fn: () => {
      const b = new Buffer('line1\nline2\nline3');
      const pos = b.deleteCharBefore(2, 0);
      assert.equal(b.lineCount, 2);
      assert.equal(b.getLine(1), 'line2line3');
      assert.deepEqual(pos, { line: 1, col: 5 });
    },
  },

  // ── name getter ───────────────────────────────────────────────────────────────
  {
    name: 'name: returns basename without directory components',
    fn: () => {
      const b = new Buffer();
      b.filePath = '/deep/path/to/my-file.ts';
      assert.equal(b.name, 'my-file.ts');
    },
  },
  {
    name: 'name: returns [No Name] when filePath is null',
    fn: () => {
      const b = new Buffer();
      assert.equal(b.name, '[No Name]');
    },
  },
];
