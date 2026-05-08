import assert from 'node:assert/strict';
import { htmlTokenizer } from '../../dist/highlight/languages/html.js';
import { defaultState } from '../../dist/highlight/tokens.js';
import type { Token, TokenType, TokenizerState, LineTokens } from '../../dist/highlight/tokens.js';
import type { TestCase } from './types.js';

export const suite = 'Language: HTML';

function tok(line: string, state: TokenizerState = defaultState()): LineTokens {
  return htmlTokenizer.tokenizeLine(line, state).tokens;
}

function next(line: string, state: TokenizerState = defaultState()): TokenizerState {
  return htmlTokenizer.tokenizeLine(line, state).nextState;
}

function find(tokens: LineTokens, type: TokenType): Token[] {
  return tokens.filter(t => t.type === type);
}

function textOf(line: string, token: Token): string {
  return line.slice(token.start, token.start + token.length);
}

export const tests: TestCase[] = [
  {
    name: 'opening tag: <div> emits tag and punctuation tokens',
    fn: () => {
      const line = '<div>';
      const t = tok(line);
      assert.ok(find(t, 'tag').length > 0);
      assert.ok(find(t, 'punctuation').length > 0);
      assert.equal(textOf(line, find(t, 'tag')[0]), 'div');
    },
  },
  {
    name: 'closing tag: </div>',
    fn: () => {
      const line = '</div>';
      const t = tok(line);
      assert.ok(find(t, 'tag').length > 0);
      assert.equal(textOf(line, find(t, 'tag')[0]), 'div');
    },
  },
  {
    name: 'attribute without value',
    fn: () => {
      const line = '<input disabled>';
      const t = tok(line);
      assert.ok(find(t, 'attribute').length > 0);
    },
  },
  {
    name: 'attribute with quoted value',
    fn: () => {
      const line = '<a href="https://example.com">';
      const t = tok(line);
      assert.ok(find(t, 'attribute').length > 0);
      assert.ok(find(t, 'value').length > 0);
    },
  },
  {
    name: 'attribute with single-quoted value',
    fn: () => {
      const line = "<a href='url'>";
      const t = tok(line);
      assert.ok(find(t, 'value').length > 0);
    },
  },
  {
    name: 'self-closing tag: <br/>',
    fn: () => {
      const line = '<br/>';
      const t = tok(line);
      assert.ok(find(t, 'tag').length > 0);
    },
  },
  {
    name: 'HTML comment: single line',
    fn: () => {
      const line = '<!-- this is a comment -->';
      const t = tok(line);
      assert.ok(find(t, 'comment').length > 0);
    },
  },
  {
    name: 'HTML comment: opens multi-line state',
    fn: () => {
      const s = next('<!-- open comment');
      assert.equal(s.inBlockComment, true);
    },
  },
  {
    name: 'HTML comment: continues across line boundary',
    fn: () => {
      const openState = next('<!-- open');
      const t = tok('still in comment', openState);
      assert.ok(t.every(tk => tk.type === 'comment'));
    },
  },
  {
    name: 'HTML comment: closes with -->',
    fn: () => {
      const openState = next('<!-- open');
      const r = htmlTokenizer.tokenizeLine('end --> <p>', openState);
      assert.equal(r.nextState.inBlockComment, false);
      assert.ok(find(r.tokens, 'comment').length > 0);
    },
  },
  {
    name: 'DOCTYPE: classified as directive',
    fn: () => {
      const line = '<!DOCTYPE html>';
      const t = tok(line);
      assert.ok(find(t, 'directive').length > 0);
    },
  },
  {
    name: 'HTML entity: &amp; classified as constant',
    fn: () => {
      const line = '&amp;';
      const t = tok(line);
      assert.ok(find(t, 'constant').length > 0);
    },
  },
  {
    name: 'text content: untagged text is normal tokens',
    fn: () => {
      const line = 'Hello World';
      const t = tok(line);
      assert.ok(t.every(tk => tk.type === 'normal'));
    },
  },
  {
    name: 'multiple attributes on one tag',
    fn: () => {
      const line = '<input type="text" name="user" required>';
      const t = tok(line);
      const attrs = find(t, 'attribute');
      assert.ok(attrs.length >= 2);
    },
  },
];
