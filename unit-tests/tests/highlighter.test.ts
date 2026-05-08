import assert from 'node:assert/strict';
import { Buffer } from '../../dist/editor/Buffer.js';
import { Highlighter } from '../../dist/highlight/Highlighter.js';
import type { TestCase } from './types.js';

export const suite = 'Highlighter';

function bufWithPath(path: string, content = 'const x = 1;'): Buffer {
  const b = new Buffer(content);
  b.filePath = path;
  return b;
}

export const tests: TestCase[] = [
  {
    name: 'getTokenizerFor: returns JS tokenizer for .js extension',
    fn: () => {
      const h = new Highlighter();
      const b = bufWithPath('/src/app.js');
      assert.ok(h.getTokenizerFor(b) !== null);
    },
  },
  {
    name: 'getTokenizerFor: returns tokenizer for .ts extension',
    fn: () => {
      const h = new Highlighter();
      assert.ok(h.getTokenizerFor(bufWithPath('/src/app.ts')) !== null);
    },
  },
  {
    name: 'getTokenizerFor: returns null for unknown extension',
    fn: () => {
      const h = new Highlighter();
      assert.equal(h.getTokenizerFor(bufWithPath('/src/data.xyz')), null);
    },
  },
  {
    name: 'getTokenizerFor: returns null when filePath is null',
    fn: () => {
      const h = new Highlighter();
      const b = new Buffer('hello');
      assert.equal(h.getTokenizerFor(b), null);
    },
  },
  {
    name: 'getTokenizerFor: result is cached (same object on repeated calls)',
    fn: () => {
      const h = new Highlighter();
      const b = bufWithPath('/src/app.js');
      const t1 = h.getTokenizerFor(b);
      const t2 = h.getTokenizerFor(b);
      assert.equal(t1, t2);
    },
  },
  {
    name: 'getTokensForLine: returns tokens for JS file',
    fn: () => {
      const h = new Highlighter();
      const b = bufWithPath('/src/app.js', 'const x = 1;');
      const tokens = h.getTokensForLine(0, b);
      assert.ok(tokens.length > 0);
    },
  },
  {
    name: 'getTokensForLine: returns empty array for unsupported language',
    fn: () => {
      const h = new Highlighter();
      const b = bufWithPath('/data.xyz', 'hello world');
      const tokens = h.getTokensForLine(0, b);
      assert.deepEqual(tokens, []);
    },
  },
  {
    name: 'languageName: correct names for known extensions',
    fn: () => {
      const h = new Highlighter();
      const cases = [
        ['/a.js',   'JavaScript'],
        ['/a.ts',   'TypeScript'],
        ['/a.c',    'C'],
        ['/a.cpp',  'C++'],
        ['/a.md',   'Markdown'],
        ['/a.html', 'HTML'],
        ['/a.css',  'CSS'],
      ];
      for (const [path, name] of cases) {
        const b = bufWithPath(path);
        assert.equal(h.languageName(b), name, `expected ${name} for ${path}`);
      }
    },
  },
  {
    name: 'languageName: Plain Text for unknown extension',
    fn: () => {
      const h = new Highlighter();
      assert.equal(h.languageName(bufWithPath('/data.xyz')), 'Plain Text');
    },
  },
  {
    name: 'languageName: Plain Text when filePath is null',
    fn: () => {
      const h = new Highlighter();
      const b = new Buffer('hello');
      assert.equal(h.languageName(b), 'Plain Text');
    },
  },
  {
    name: 'invalidateFrom: re-tokenizes after edit',
    fn: () => {
      const h = new Highlighter();
      const b = bufWithPath('/src/app.js', 'const x = 1;');
      const before = h.getTokensForLine(0, b);
      b.lines[0] = '// a comment';
      h.invalidateFrom(0, b);
      const after = h.getTokensForLine(0, b);
      const hasComment = after.some(t => t.type === 'comment');
      assert.ok(hasComment, 'should find comment token after invalidation');
    },
  },
  {
    name: 'onFilePathChange: clears cached tokenizer so new extension is used',
    fn: () => {
      const h = new Highlighter();
      const b = bufWithPath('/src/app.xyz', 'const x = 1;'); // unknown -> null
      assert.equal(h.getTokenizerFor(b), null);
      b.filePath = '/src/app.js';
      h.onFilePathChange(b);
      assert.ok(h.getTokenizerFor(b) !== null); // now JS
    },
  },
  {
    name: 'separate Buffer instances get independent caches',
    fn: () => {
      const h = new Highlighter();
      const b1 = bufWithPath('/a.js', 'const a = 1;');
      const b2 = bufWithPath('/b.js', '// comment');
      const t1 = h.getTokensForLine(0, b1);
      const t2 = h.getTokensForLine(0, b2);
      assert.notEqual(t1, t2);
    },
  },
];
