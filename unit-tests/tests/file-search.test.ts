import assert from 'node:assert/strict';
import { Buffer } from '../../dist/editor/Buffer.js';
import { searchInBuffer, searchInBuffers } from '../../dist/search/FileSearch.js';
import type { TestCase } from './types.js';

export const suite = 'FileSearch';

function buf(text: string): Buffer { return new Buffer(text); }

export const tests: TestCase[] = [
  {
    name: 'searchInBuffer: empty needle returns empty array',
    fn: () => {
      const results = searchInBuffer('', buf('hello\nworld'));
      assert.equal(results.length, 0);
    },
  },
  {
    name: 'searchInBuffer: matches lines containing the needle',
    fn: () => {
      const b = buf('foo bar\nhello world\nbaz');
      const results = searchInBuffer('hello', b);
      assert.equal(results.length, 1);
      assert.equal(results[0].line, 1);
      assert.equal(results[0].snippet, 'hello world');
    },
  },
  {
    name: 'searchInBuffer: no match returns empty array',
    fn: () => {
      const results = searchInBuffer('xyz', buf('foo\nbar'));
      assert.equal(results.length, 0);
    },
  },
  {
    name: 'searchInBuffer: matches on multiple lines',
    fn: () => {
      const b = buf('test one\ntest two\nno match');
      const results = searchInBuffer('test', b);
      assert.equal(results.length, 2);
      assert.equal(results[0].line, 0);
      assert.equal(results[1].line, 1);
    },
  },
  {
    name: 'searchInBuffer: result has correct buffer reference',
    fn: () => {
      const b = buf('hello');
      const results = searchInBuffer('hello', b);
      assert.equal(results[0].buffer, b);
    },
  },
  {
    name: 'searchInBuffer: result col is index of first matched char',
    fn: () => {
      const b = buf('  hello');
      const results = searchInBuffer('hello', b);
      assert.equal(results[0].col, 2);
    },
  },
  {
    name: 'searchInBuffer: matchIndices are populated',
    fn: () => {
      const b = buf('hello');
      const results = searchInBuffer('hlo', b);
      assert.ok(results.length > 0);
      assert.ok(results[0].matchIndices.length === 3);
    },
  },
  {
    name: 'searchInBuffers: empty needle returns empty array',
    fn: () => {
      const results = searchInBuffers('', [buf('hello'), buf('world')]);
      assert.equal(results.length, 0);
    },
  },
  {
    name: 'searchInBuffers: aggregates matches from all buffers',
    fn: () => {
      const b1 = buf('hello there');
      const b2 = buf('say hello');
      const results = searchInBuffers('hello', [b1, b2]);
      assert.equal(results.length, 2);
    },
  },
  {
    name: 'searchInBuffer: results sorted by score descending',
    fn: () => {
      // Line order in buffer: "  match" (score 76), "match" (score 80), " match" (score 77)
      // After sort by score desc: line 1 (80), line 2 (77), line 0 (76)
      const b = buf('  match\nmatch\n match');
      const results = searchInBuffer('match', b);
      assert.equal(results.length, 3);
      assert.equal(results[0].line, 1); // "match" at col 0 — highest score
      assert.equal(results[1].line, 2); // " match" — second
      assert.equal(results[2].line, 0); // "  match" — lowest
      // scores must be non-increasing
      assert.ok(results[0].score >= results[1].score);
      assert.ok(results[1].score >= results[2].score);
    },
  },
  {
    name: 'searchInBuffers: results sorted by score descending across buffers',
    fn: () => {
      // b1 line 0 "match"       → score 80 (exact at start)
      // b2 line 0 " match start"→ score 77 (word boundary, start penalty -1)
      // b1 line 1 "also match"  → score 73 (word boundary, start penalty -5)
      const b1 = new Buffer('match\nalso match');
      b1.filePath = '/z/zebra.txt';
      const b2 = new Buffer(' match start');
      b2.filePath = '/a/alpha.txt';
      const results = searchInBuffers('match', [b1, b2]);
      assert.equal(results.length, 3);
      assert.equal(results[0].buffer, b1);
      assert.equal(results[0].line, 0);  // score 80 — best
      assert.equal(results[1].buffer, b2);
      assert.equal(results[1].line, 0);  // score 77 — second
      assert.equal(results[2].buffer, b1);
      assert.equal(results[2].line, 1);  // score 73 — third
      // scores must be non-increasing
      assert.ok(results[0].score >= results[1].score);
      assert.ok(results[1].score >= results[2].score);
    },
  },
];
