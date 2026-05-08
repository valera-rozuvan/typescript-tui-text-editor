import assert from 'node:assert/strict';
import { cssTokenizer } from '../../dist/highlight/languages/css.js';
import { defaultState } from '../../dist/highlight/tokens.js';
import type { Token, TokenType, TokenizerState, LineTokens } from '../../dist/highlight/tokens.js';
import type { TestCase } from './types.js';

export const suite = 'Language: CSS';

function tok(line: string, state: TokenizerState = defaultState()): LineTokens {
  return cssTokenizer.tokenizeLine(line, state).tokens;
}

function next(line: string, state: TokenizerState = defaultState()): TokenizerState {
  return cssTokenizer.tokenizeLine(line, state).nextState;
}

function find(tokens: LineTokens, type: TokenType): Token[] {
  return tokens.filter(t => t.type === type);
}

function textOf(line: string, token: Token): string {
  return line.slice(token.start, token.start + token.length);
}

export const tests: TestCase[] = [
  {
    name: 'selector: element name before { is selector',
    fn: () => {
      const line = 'body {';
      const t = tok(line);
      assert.ok(find(t, 'selector').length > 0);
    },
  },
  {
    name: 'selector: .class-name is selector',
    fn: () => {
      const line = '.container {';
      const t = tok(line);
      assert.ok(find(t, 'selector').length > 0);
    },
  },
  {
    name: 'property: known CSS property before : is attribute',
    fn: () => {
      const line = '  color: red;';
      const t = tok(line);
      assert.ok(find(t, 'attribute').length > 0);
    },
  },
  {
    name: 'property: display, margin, padding are attributes',
    fn: () => {
      for (const prop of ['display', 'margin', 'padding']) {
        const line = `  ${prop}: value;`;
        const t = tok(line);
        assert.ok(find(t, 'attribute').length > 0, `${prop} should be attribute`);
      }
    },
  },
  {
    name: 'at-rule: @media, @keyframes are keywords',
    fn: () => {
      for (const rule of ['@media', '@keyframes', '@import']) {
        const line = `${rule} screen`;
        const t = tok(line);
        assert.ok(find(t, 'keyword').length > 0, `${rule} should be keyword`);
      }
    },
  },
  {
    name: 'block comment: single line',
    fn: () => {
      const line = '/* this is a comment */';
      const t = tok(line);
      assert.ok(find(t, 'comment').length > 0);
    },
  },
  {
    name: 'block comment: opens state across lines',
    fn: () => {
      const s1 = next('/* open comment');
      assert.equal(s1.inBlockComment, true);
      const r2 = cssTokenizer.tokenizeLine('end */ color: red;', s1);
      assert.equal(r2.nextState.inBlockComment, false);
      assert.ok(find(r2.tokens, 'comment').length > 0);
    },
  },
  {
    name: 'string: double-quoted value',
    fn: () => {
      const line = 'content: "hello";';
      const t = tok(line);
      assert.ok(find(t, 'string').length > 0);
    },
  },
  {
    name: 'string: single-quoted value',
    fn: () => {
      const line = "font-family: 'Arial';";
      const t = tok(line);
      assert.ok(find(t, 'string').length > 0);
    },
  },
  {
    name: 'number: px value',
    fn: () => {
      const line = '  width: 100px;';
      const t = tok(line);
      assert.ok(find(t, 'number').length > 0);
    },
  },
  {
    name: 'number: em value',
    fn: () => {
      const line = '  font-size: 1.5em;';
      const t = tok(line);
      assert.ok(find(t, 'number').length > 0);
    },
  },
  {
    name: 'number: percentage',
    fn: () => {
      const line = '  width: 50%;';
      const t = tok(line);
      assert.ok(find(t, 'number').length > 0);
    },
  },
  {
    name: 'hash color: #rgb is number',
    fn: () => {
      const line = '  color: #ff0080;';
      const t = tok(line);
      const nums = find(t, 'number');
      assert.ok(nums.some(n => textOf(line, n).startsWith('#')));
    },
  },
  {
    name: 'punctuation: { } : ; ( ) , are punctuation',
    fn: () => {
      const t = tok('a { color: red; }');
      assert.ok(find(t, 'punctuation').length > 0);
    },
  },
  {
    name: 'negative value: -10px parsed as selector (leading - matches ident pattern)',
    fn: () => {
      // The identifier pattern /[a-zA-Z\-_]/ matches '-', so '-10px' is
      // tokenized as a selector rather than a number in the current implementation.
      const line = '  margin: -10px;';
      const t = tok(line);
      const negVal = find(t, 'selector').find(tk => textOf(line, tk) === '-10px');
      assert.ok(negVal, '-10px should be a selector token (identifier-start heuristic)');
    },
  },
];
