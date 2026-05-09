import assert from 'node:assert/strict';
import { writeFile, readFile, mkdtemp, rm, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Buffer } from '../../dist/editor/Buffer.js';
import type { TestCase } from './types.js';

export const suite = 'Buffer';

export const tests: TestCase[] = [
  {
    name: 'constructor: empty content gives single empty line',
    fn: () => {
      const b = new Buffer();
      assert.deepEqual(b.lines, ['']);
      assert.equal(b.lineCount, 1);
      assert.equal(b.modified, false);
      assert.equal(b.readOnly, false);
    },
  },
  {
    name: 'constructor: content is split by newlines',
    fn: () => {
      const b = new Buffer('hello\nworld\n!');
      assert.deepEqual(b.lines, ['hello', 'world', '!']);
      assert.equal(b.lineCount, 3);
    },
  },
  {
    name: 'constructor: single line without newline',
    fn: () => {
      const b = new Buffer('hello');
      assert.deepEqual(b.lines, ['hello']);
      assert.equal(b.lineCount, 1);
    },
  },
  {
    name: 'getLine: returns correct line by index',
    fn: () => {
      const b = new Buffer('a\nb\nc');
      assert.equal(b.getLine(0), 'a');
      assert.equal(b.getLine(1), 'b');
      assert.equal(b.getLine(2), 'c');
    },
  },
  {
    name: 'getLine: returns empty string for out-of-bounds index',
    fn: () => {
      const b = new Buffer('hello');
      assert.equal(b.getLine(99), '');
      assert.equal(b.getLine(-1), '');
    },
  },
  {
    name: 'name: returns [No Name] when filePath is null',
    fn: () => {
      const b = new Buffer();
      assert.equal(b.name, '[No Name]');
    },
  },
  {
    name: 'name: returns basename of filePath',
    fn: () => {
      const b = new Buffer();
      b.filePath = '/some/path/to/file.ts';
      assert.equal(b.name, 'file.ts');
    },
  },
  {
    name: 'insert: adds text at given column',
    fn: () => {
      const b = new Buffer('hello');
      b.insert(0, 2, 'XY');
      assert.equal(b.getLine(0), 'heXYllo');
      assert.equal(b.modified, true);
    },
  },
  {
    name: 'insert: at start of line',
    fn: () => {
      const b = new Buffer('hello');
      b.insert(0, 0, 'AB');
      assert.equal(b.getLine(0), 'ABhello');
    },
  },
  {
    name: 'insert: at end of line',
    fn: () => {
      const b = new Buffer('hello');
      b.insert(0, 5, '!');
      assert.equal(b.getLine(0), 'hello!');
    },
  },
  {
    name: 'insert: does nothing for out-of-bounds line',
    fn: () => {
      const b = new Buffer('hello');
      b.insert(99, 0, 'x');
      assert.equal(b.getLine(0), 'hello');
      assert.equal(b.modified, false);
    },
  },
  {
    name: 'deleteChar: removes character at position',
    fn: () => {
      const b = new Buffer('hello');
      b.deleteChar(0, 1);
      assert.equal(b.getLine(0), 'hllo');
      assert.equal(b.modified, true);
    },
  },
  {
    name: 'deleteChar: at start of line',
    fn: () => {
      const b = new Buffer('hello');
      b.deleteChar(0, 0);
      assert.equal(b.getLine(0), 'ello');
    },
  },
  {
    name: 'deleteChar: col at length is a no-op (off end)',
    fn: () => {
      const b = new Buffer('hello');
      b.deleteChar(0, 5);
      assert.equal(b.getLine(0), 'hello');
      assert.equal(b.modified, false);
    },
  },
  {
    name: 'deleteChar: negative col is a no-op',
    fn: () => {
      const b = new Buffer('hello');
      b.deleteChar(0, -1);
      assert.equal(b.getLine(0), 'hello');
    },
  },
  {
    name: 'deleteCharBefore: mid-line deletes previous character',
    fn: () => {
      const b = new Buffer('hello');
      const pos = b.deleteCharBefore(0, 3);
      assert.equal(b.getLine(0), 'helo');
      assert.deepEqual(pos, { line: 0, col: 2 });
      assert.equal(b.modified, true);
    },
  },
  {
    name: 'deleteCharBefore: col 0 on non-first line merges with previous line',
    fn: () => {
      const b = new Buffer('foo\nbar');
      const pos = b.deleteCharBefore(1, 0);
      assert.equal(b.lineCount, 1);
      assert.equal(b.getLine(0), 'foobar');
      assert.deepEqual(pos, { line: 0, col: 3 });
    },
  },
  {
    name: 'deleteCharBefore: at line 0 col 0 is a no-op',
    fn: () => {
      const b = new Buffer('hello');
      const pos = b.deleteCharBefore(0, 0);
      assert.equal(b.getLine(0), 'hello');
      assert.deepEqual(pos, { line: 0, col: 0 });
      assert.equal(b.modified, false);
    },
  },
  {
    name: 'insertNewline: splits line at column',
    fn: () => {
      const b = new Buffer('hello world');
      b.insertNewline(0, 5);
      assert.equal(b.lineCount, 2);
      assert.equal(b.getLine(0), 'hello');
      assert.equal(b.getLine(1), ' world');
      assert.equal(b.modified, true);
    },
  },
  {
    name: 'insertNewline: carries leading indentation to new line',
    fn: () => {
      const b = new Buffer('  indented text');
      b.insertNewline(0, 15);
      assert.equal(b.getLine(1), '  ');
    },
  },
  {
    name: 'insertNewline: at col 0 inserts blank line before',
    fn: () => {
      const b = new Buffer('hello');
      b.insertNewline(0, 0);
      assert.equal(b.lineCount, 2);
      assert.equal(b.getLine(0), '');
      assert.equal(b.getLine(1), 'hello');
    },
  },
  {
    name: 'indentAt: returns count of leading spaces',
    fn: () => {
      const b = new Buffer('  hi\n    deep\nnone');
      assert.equal(b.indentAt(0), 2);
      assert.equal(b.indentAt(1), 4);
      assert.equal(b.indentAt(2), 0);
    },
  },
  {
    name: 'toString: joins lines with newline and appends trailing newline',
    fn: () => {
      const b = new Buffer('foo\nbar');
      assert.equal(b.toString(), 'foo\nbar\n');
    },
  },
  {
    name: 'fromFile: reads existing file stripping trailing empty line',
    fn: async () => {
      const dir  = await mkdtemp(join(tmpdir(), 'buf-'));
      const path = join(dir, 'test.txt');
      await writeFile(path, 'line1\nline2\nline3\n', 'utf8');
      try {
        const b = await Buffer.fromFile(path);
        assert.equal(b.lineCount, 3);
        assert.equal(b.getLine(0), 'line1');
        assert.equal(b.getLine(2), 'line3');
        assert.equal(b.filePath, path);
        assert.equal(b.modified, false);
        assert.equal(b.readOnly, false);
      } finally {
        await rm(dir, { recursive: true });
      }
    },
  },
  {
    name: 'fromFile: sets readOnly = true for a non-writable file',
    fn: async () => {
      const dir  = await mkdtemp(join(tmpdir(), 'buf-ro-'));
      const path = join(dir, 'ro.txt');
      await writeFile(path, 'data\n', 'utf8');
      await chmod(path, 0o444);
      try {
        const b = await Buffer.fromFile(path);
        assert.equal(b.readOnly, true);
        assert.equal(b.modified, false);
      } finally {
        await chmod(path, 0o644);
        await rm(dir, { recursive: true });
      }
    },
  },
  {
    name: 'fromFile: returns empty buffer for missing file (ENOENT)',
    fn: async () => {
      const b = await Buffer.fromFile('/tmp/__no_such_file_xyz_123.txt');
      assert.equal(b.lineCount, 1);
      assert.equal(b.getLine(0), '');
      assert.equal(b.readOnly, false);
    },
  },
  {
    name: 'save: writes content to disk and clears modified flag',
    fn: async () => {
      const dir  = await mkdtemp(join(tmpdir(), 'buf-save-'));
      const path = join(dir, 'out.txt');
      try {
        const b = new Buffer('foo\nbar');
        b.filePath = path;
        b.modified = true;
        await b.save();
        const written = await readFile(path, 'utf8');
        assert.equal(written, 'foo\nbar\n');
        assert.equal(b.modified, false);
      } finally {
        await rm(dir, { recursive: true });
      }
    },
  },
  {
    name: 'save: does nothing when filePath is null',
    fn: async () => {
      const b = new Buffer('hello');
      await b.save(); // must not throw
    },
  },
];
