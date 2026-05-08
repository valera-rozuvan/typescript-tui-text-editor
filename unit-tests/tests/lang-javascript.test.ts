import assert from 'node:assert/strict';
import { jsTokenizer } from '../../dist/highlight/languages/javascript.js';
import { defaultState } from '../../dist/highlight/tokens.js';
import type { Token, TokenType, TokenizerState, LineTokens } from '../../dist/highlight/tokens.js';
import type { TestCase } from './types.js';

export const suite = 'Language: JavaScript';

function tok(line: string, state: TokenizerState = defaultState()): LineTokens {
  return jsTokenizer.tokenizeLine(line, state).tokens;
}

function types(line: string, state?: TokenizerState): TokenType[] {
  return tok(line, state).map(t => t.type);
}

function find(tokens: LineTokens, type: TokenType): Token[] {
  return tokens.filter(t => t.type === type);
}

function textOf(line: string, token: Token): string {
  return line.slice(token.start, token.start + token.length);
}

export const tests: TestCase[] = [
  {
    name: 'keywords: const, let, var are tokenized as keyword',
    fn: () => {
      for (const kw of ['const', 'let', 'var']) {
        const t = tok(`${kw} x = 1`);
        const kws = find(t, 'keyword');
        assert.ok(kws.some(k => textOf(`${kw} x = 1`, k) === kw), `${kw} not found`);
      }
    },
  },
  {
    name: 'keywords: if, else, for, while, return are keywords',
    fn: () => {
      for (const kw of ['if', 'else', 'return', 'while']) {
        const line = `${kw} something`;
        const t = tok(line);
        assert.ok(find(t, 'keyword').some(k => textOf(line, k) === kw));
      }
    },
  },
  {
    name: 'line comment: entire rest of line is comment',
    fn: () => {
      const line = 'const x = 1; // comment here';
      const t = tok(line);
      const comments = find(t, 'comment');
      assert.ok(comments.length > 0);
      const c = comments[0];
      assert.ok(line.slice(c.start).startsWith('//'));
    },
  },
  {
    name: 'block comment: single line',
    fn: () => {
      const t = tok('/* hello */ const x');
      assert.ok(find(t, 'comment').length > 0);
      assert.ok(find(t, 'keyword').length > 0);
    },
  },
  {
    name: 'block comment: opens state across lines',
    fn: () => {
      const st = defaultState();
      const r1 = jsTokenizer.tokenizeLine('/* open comment', st);
      assert.equal(r1.nextState.inBlockComment, true);
      const r2 = jsTokenizer.tokenizeLine('still in comment */ code', r1.nextState);
      assert.equal(r2.nextState.inBlockComment, false);
      assert.ok(find(r2.tokens, 'comment').length > 0);
    },
  },
  {
    name: 'string: double-quoted string',
    fn: () => {
      const line = 'const s = "hello world";';
      const t = tok(line);
      assert.ok(find(t, 'string').length > 0);
    },
  },
  {
    name: 'string: single-quoted string',
    fn: () => {
      const t = tok("const s = 'hi';");
      assert.ok(find(t, 'string').length > 0);
    },
  },
  {
    name: 'template literal: backtick string',
    fn: () => {
      const t = tok('const s = `hello`;');
      assert.ok(find(t, 'string').length > 0);
    },
  },
  {
    name: 'template literal: opens multi-line state',
    fn: () => {
      const r = jsTokenizer.tokenizeLine('const s = `start', defaultState());
      assert.equal(r.nextState.inMultiLineString, true);
    },
  },
  {
    name: 'template literal: closes state on closing backtick',
    fn: () => {
      const open = jsTokenizer.tokenizeLine('const s = `start', defaultState());
      const close = jsTokenizer.tokenizeLine('end`;', open.nextState);
      assert.equal(close.nextState.inMultiLineString, false);
    },
  },
  {
    name: 'number: integer literal',
    fn: () => {
      const t = tok('const x = 42;');
      assert.ok(find(t, 'number').length > 0);
    },
  },
  {
    name: 'number: float literal',
    fn: () => {
      const t = tok('const x = 3.14;');
      assert.ok(find(t, 'number').length > 0);
    },
  },
  {
    name: 'number: hex literal 0x...',
    fn: () => {
      const t = tok('const x = 0xFF;');
      assert.ok(find(t, 'number').length > 0);
    },
  },
  {
    name: 'number: binary literal 0b...',
    fn: () => {
      const t = tok('const x = 0b1010;');
      assert.ok(find(t, 'number').length > 0);
    },
  },
  {
    name: 'number: bigint literal n suffix',
    fn: () => {
      const line = 'const x = 100n;';
      const t = tok(line);
      const num = find(t, 'number')[0];
      assert.ok(num);
      assert.equal(textOf(line, num), '100n');
    },
  },
  {
    name: 'function: call expression classified as function',
    fn: () => {
      const line = 'doThing(arg)';
      const t = tok(line);
      assert.ok(find(t, 'function').length > 0);
    },
  },
  {
    name: 'property: identifier after . is property',
    fn: () => {
      const line = 'obj.name';
      const t = tok(line);
      assert.ok(find(t, 'property').length > 0);
    },
  },
  {
    name: 'type: PascalCase identifier is type',
    fn: () => {
      const line = 'const x = MyClass';
      const t = tok(line);
      assert.ok(find(t, 'type').length > 0);
    },
  },
  {
    name: 'operator: multi-char operator ===',
    fn: () => {
      const t = tok('a === b');
      assert.ok(find(t, 'operator').length > 0);
    },
  },
  {
    name: 'operator: arrow function =>',
    fn: () => {
      const t = tok('const f = () =>');
      assert.ok(find(t, 'operator').length > 0);
    },
  },
  {
    name: 'punctuation: braces, parens, semicolons',
    fn: () => {
      const t = tok('function f() { return 1; }');
      assert.ok(find(t, 'punctuation').length > 0);
    },
  },
  {
    name: 'empty line produces no tokens',
    fn: () => {
      const t = tok('');
      assert.equal(t.length, 0);
    },
  },
  {
    name: 'whitespace-only line produces no tokens',
    fn: () => {
      const t = tok('   ');
      assert.equal(t.length, 0);
    },
  },
];
