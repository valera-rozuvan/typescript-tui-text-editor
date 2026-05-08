import assert from 'node:assert/strict';
import { cppTokenizer } from '../../dist/highlight/languages/cpp.js';
import { defaultState } from '../../dist/highlight/tokens.js';
import type { Token, TokenType, TokenizerState, LineTokens } from '../../dist/highlight/tokens.js';
import type { TestCase } from './types.js';

export const suite = 'Language: C++';

function tok(line: string, state: TokenizerState = defaultState()): LineTokens {
  return cppTokenizer.tokenizeLine(line, state).tokens;
}

function find(tokens: LineTokens, type: TokenType): Token[] {
  return tokens.filter(t => t.type === type);
}

function textOf(line: string, token: Token): string {
  return line.slice(token.start, token.start + token.length);
}

export const tests: TestCase[] = [
  {
    name: 'C++ keywords: class, namespace, template, public, private',
    fn: () => {
      for (const kw of ['class', 'namespace', 'template', 'public', 'private']) {
        const line = `${kw} Foo`;
        const t = tok(line);
        assert.ok(find(t, 'keyword').some(k => textOf(line, k) === kw), `${kw} missing`);
      }
    },
  },
  {
    name: 'C++ keywords: new, delete, try, catch, throw',
    fn: () => {
      for (const kw of ['new', 'delete', 'try', 'catch', 'throw']) {
        const line = `${kw} foo`;
        const t = tok(line);
        assert.ok(find(t, 'keyword').some(k => textOf(line, k) === kw), `${kw} missing`);
      }
    },
  },
  {
    name: 'C++ keywords: virtual, override, final, explicit',
    fn: () => {
      for (const kw of ['virtual', 'override', 'final', 'explicit']) {
        const line = `${kw} foo`;
        const t = tok(line);
        assert.ok(find(t, 'keyword').some(k => textOf(line, k) === kw), `${kw} missing`);
      }
    },
  },
  {
    name: ':: scope operator: emits a single operator token of length 2',
    fn: () => {
      const line = 'std::string';
      const t = tok(line);
      const ops = find(t, 'operator');
      const scopeOp = ops.find(o => textOf(line, o) === '::');
      assert.ok(scopeOp, 'should have operator token for ::');
      assert.equal(scopeOp.length, 2);
    },
  },
  {
    name: ':: scope operator: no duplicate single-colon punctuation token',
    fn: () => {
      const line = 'std::cout';
      const t = tok(line);
      const colons = t.filter(tk => textOf(line, tk) === ':');
      assert.equal(colons.length, 0, 'should not have lone : tokens for ::');
    },
  },
  {
    name: 'inherits C: preprocessor directives',
    fn: () => {
      const t = tok('#include <vector>');
      assert.equal(t[0].type, 'directive');
    },
  },
  {
    name: 'inherits C: block comments',
    fn: () => {
      const t = tok('/* comment */');
      assert.ok(find(t, 'comment').length > 0);
    },
  },
  {
    name: 'inherits C: string literals',
    fn: () => {
      const t = tok('"hello world"');
      assert.ok(find(t, 'string').length > 0);
    },
  },
  {
    name: 'inherits C: number literals',
    fn: () => {
      const t = tok('int x = 42;');
      assert.ok(find(t, 'number').length > 0);
    },
  },
  {
    name: 'function call in C++ context',
    fn: () => {
      const t = tok('foo()');
      assert.ok(find(t, 'function').length > 0);
    },
  },
  {
    name: 'multiple :: on same line',
    fn: () => {
      const line = 'ns::sub::func()';
      const t = tok(line);
      const scopeOps = find(t, 'operator').filter(o => textOf(line, o) === '::');
      assert.equal(scopeOps.length, 2, 'should have two :: operators');
    },
  },
];
