import assert from 'node:assert/strict';
import { cTokenizer } from '../../dist/highlight/languages/c.js';
import { defaultState } from '../../dist/highlight/tokens.js';
import type { Token, TokenType, TokenizerState, LineTokens } from '../../dist/highlight/tokens.js';
import type { TestCase } from './types.js';

export const suite = 'Language: C';

function tok(line: string, state: TokenizerState = defaultState()): LineTokens {
  return cTokenizer.tokenizeLine(line, state).tokens;
}

function find(tokens: LineTokens, type: TokenType): Token[] {
  return tokens.filter(t => t.type === type);
}

function textOf(line: string, token: Token): string {
  return line.slice(token.start, token.start + token.length);
}

export const tests: TestCase[] = [
  {
    name: 'preprocessor directive: entire line is directive',
    fn: () => {
      const line = '#include <stdio.h>';
      const t = tok(line);
      assert.equal(t.length, 1);
      assert.equal(t[0].type, 'directive');
      assert.equal(t[0].start, 0);
      assert.equal(t[0].length, line.length);
    },
  },
  {
    name: 'preprocessor directive: #define',
    fn: () => {
      const line = '#define MAX 100';
      const t = tok(line);
      assert.equal(t[0].type, 'directive');
    },
  },
  {
    name: 'keyword: int, char, void, return etc.',
    fn: () => {
      for (const kw of ['int', 'char', 'void', 'return', 'for', 'if', 'while']) {
        const line = `${kw} foo`;
        const t = tok(line);
        assert.ok(find(t, 'keyword').some(k => textOf(line, k) === kw), `${kw} missing`);
      }
    },
  },
  {
    name: 'type: size_t and int8_t are types',
    fn: () => {
      const line = 'size_t len';
      const t = tok(line);
      assert.ok(find(t, 'type').length > 0 || find(t, 'keyword').length > 0);
    },
  },
  {
    name: 'constant: ALL_CAPS identifier is constant',
    fn: () => {
      const line = 'int x = MAX_VALUE;';
      const t = tok(line);
      assert.ok(find(t, 'constant').length > 0);
    },
  },
  {
    name: 'line comment: // rest of line',
    fn: () => {
      const line = 'int x = 0; // comment';
      const t = tok(line);
      assert.ok(find(t, 'comment').length > 0);
    },
  },
  {
    name: 'block comment: single line',
    fn: () => {
      const t = tok('/* comment */ int x;');
      assert.ok(find(t, 'comment').length > 0);
      assert.ok(find(t, 'keyword').length > 0);
    },
  },
  {
    name: 'block comment: multi-line state',
    fn: () => {
      const r1 = cTokenizer.tokenizeLine('/* open', defaultState());
      assert.equal(r1.nextState.inBlockComment, true);
      const r2 = cTokenizer.tokenizeLine('  still comment */ int x;', r1.nextState);
      assert.equal(r2.nextState.inBlockComment, false);
      assert.ok(find(r2.tokens, 'comment').length > 0);
    },
  },
  {
    name: 'string literal: double-quoted',
    fn: () => {
      const t = tok('"hello world"');
      assert.ok(find(t, 'string').length > 0);
    },
  },
  {
    name: 'char literal: single-quoted',
    fn: () => {
      const t = tok("char c = 'a';");
      assert.ok(find(t, 'string').length > 0);
    },
  },
  {
    name: 'number: decimal integer',
    fn: () => {
      const t = tok('int x = 42;');
      assert.ok(find(t, 'number').length > 0);
    },
  },
  {
    name: 'number: hex literal 0x',
    fn: () => {
      const t = tok('int x = 0xFF;');
      assert.ok(find(t, 'number').length > 0);
    },
  },
  {
    name: 'number: float with suffix',
    fn: () => {
      const t = tok('float f = 3.14f;');
      assert.ok(find(t, 'number').length > 0);
    },
  },
  {
    name: 'function call',
    fn: () => {
      const t = tok('printf("hello");');
      assert.ok(find(t, 'function').length > 0);
    },
  },
  {
    name: 'struct member access (arrow ->)',
    fn: () => {
      const line = 'ptr->field';
      const t = tok(line);
      assert.ok(find(t, 'property').length > 0);
    },
  },
  {
    name: 'punctuation: braces, parens',
    fn: () => {
      const t = tok('int f() { return 0; }');
      assert.ok(find(t, 'punctuation').length > 0);
    },
  },
];
