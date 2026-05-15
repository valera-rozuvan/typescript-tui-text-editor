import assert from 'node:assert/strict';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Buffer } from '../../dist/editor/Buffer.js';
import type { TestCase } from './types.js';

export const suite = 'Buffer (CRLF)';

export const tests: TestCase[] = [
  // ── constructor: CRLF normalisation ──────────────────────────────────────
  {
    name: 'constructor: CRLF content is normalised — no \\r in any line',
    fn: () => {
      const b = new Buffer('foo\r\nbar\r\nbaz');
      for (const line of b.lines) {
        assert.ok(!line.includes('\r'), `line contains \\r: ${JSON.stringify(line)}`);
      }
      assert.equal(b.getLine(0), 'foo');
      assert.equal(b.getLine(1), 'bar');
      assert.equal(b.getLine(2), 'baz');
    },
  },
  {
    name: 'constructor: bare CR is normalised',
    fn: () => {
      const b = new Buffer('a\rb\rc');
      assert.equal(b.getLine(0), 'a');
      assert.equal(b.getLine(1), 'b');
      assert.equal(b.getLine(2), 'c');
      for (const line of b.lines) {
        assert.ok(!line.includes('\r'));
      }
    },
  },
  {
    name: 'constructor: pure LF content is unchanged',
    fn: () => {
      const b = new Buffer('hello\nworld');
      assert.equal(b.getLine(0), 'hello');
      assert.equal(b.getLine(1), 'world');
    },
  },

  // ── lineEnding detection via fromFile ─────────────────────────────────────
  {
    name: 'fromFile: CRLF file → lineEnding is \\r\\n, no \\r in lines',
    fn: async () => {
      const dir  = await mkdtemp(join(tmpdir(), 'buf-crlf-'));
      const path = join(dir, 'crlf.txt');
      await writeFile(path, 'foo\r\nbar\r\n', 'utf8');
      try {
        const b = await Buffer.fromFile(path);
        assert.equal(b.lineEnding, '\r\n');
        assert.equal(b.lineCount, 2);
        assert.equal(b.getLine(0), 'foo');
        assert.equal(b.getLine(1), 'bar');
        for (const line of b.lines) {
          assert.ok(!line.includes('\r'));
        }
      } finally {
        await rm(dir, { recursive: true });
      }
    },
  },
  {
    name: 'fromFile: LF-only file → lineEnding is \\n',
    fn: async () => {
      const dir  = await mkdtemp(join(tmpdir(), 'buf-lf-'));
      const path = join(dir, 'lf.txt');
      await writeFile(path, 'hello\nworld\n', 'utf8');
      try {
        const b = await Buffer.fromFile(path);
        assert.equal(b.lineEnding, '\n');
      } finally {
        await rm(dir, { recursive: true });
      }
    },
  },

  // ── toString round-trip ───────────────────────────────────────────────────
  {
    name: 'toString: CRLF buffer round-trips with \\r\\n line endings',
    fn: async () => {
      const dir  = await mkdtemp(join(tmpdir(), 'buf-rt-'));
      const path = join(dir, 'rt.txt');
      const original = 'line1\r\nline2\r\nline3\r\n';
      await writeFile(path, original, 'utf8');
      try {
        const b = await Buffer.fromFile(path);
        assert.equal(b.toString(), original);
      } finally {
        await rm(dir, { recursive: true });
      }
    },
  },
  {
    name: 'toString: LF buffer round-trips with \\n line endings',
    fn: async () => {
      const dir  = await mkdtemp(join(tmpdir(), 'buf-rt-lf-'));
      const path = join(dir, 'rt.txt');
      const original = 'alpha\nbeta\ngamma\n';
      await writeFile(path, original, 'utf8');
      try {
        const b = await Buffer.fromFile(path);
        assert.equal(b.toString(), original);
      } finally {
        await rm(dir, { recursive: true });
      }
    },
  },
  {
    name: 'toString: manually set lineEnding controls output',
    fn: () => {
      const b = new Buffer('x\ny');
      b.lineEnding = '\r\n';
      assert.equal(b.toString(), 'x\r\ny\r\n');
    },
  },
];
