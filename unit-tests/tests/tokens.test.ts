import assert from 'node:assert/strict';
import { defaultState, tokenColor, THEME } from '../../dist/highlight/tokens.js';
import type { TestCase } from './types.js';

export const suite = 'tokens';

const ALL_TYPES = [
  'normal','keyword','string','number','comment','operator','punctuation',
  'type','function','property','variable','constant','tag','attribute',
  'selector','value','heading','emphasis','strong','link','code','directive',
];

export const tests: TestCase[] = [
  {
    name: 'defaultState: returns correct initial state shape',
    fn: () => {
      const s = defaultState();
      assert.equal(s.inBlockComment, false);
      assert.equal(s.inMultiLineString, false);
      assert.equal(s.multiLineStringChar, '');
    },
  },
  {
    name: 'defaultState: returns a fresh object each call',
    fn: () => {
      const a = defaultState();
      const b = defaultState();
      a.inBlockComment = true;
      assert.equal(b.inBlockComment, false);
    },
  },
  {
    name: 'tokenColor: returns a 3-element RGB tuple for every token type',
    fn: () => {
      for (const type of ALL_TYPES) {
        const color = tokenColor(type as Parameters<typeof tokenColor>[0]);
        assert.ok(Array.isArray(color), `${type} should return array`);
        assert.equal(color.length, 3);
        for (const channel of color) {
          assert.ok(Number.isInteger(channel) && channel >= 0 && channel <= 255,
            `channel ${channel} out of range for type ${type}`);
        }
      }
    },
  },
  {
    name: 'tokenColor: unknown type falls back to fg colour',
    fn: () => {
      const fallback = tokenColor('unknown_token_xyz' as Parameters<typeof tokenColor>[0]);
      assert.deepEqual(fallback, THEME.fg);
    },
  },
  {
    name: 'THEME: keyword maps to blue',
    fn: () => {
      assert.deepEqual(tokenColor('keyword'), THEME.blue);
    },
  },
  {
    name: 'THEME: string maps to green',
    fn: () => {
      assert.deepEqual(tokenColor('string'), THEME.green);
    },
  },
  {
    name: 'THEME: comment maps to overlay',
    fn: () => {
      assert.deepEqual(tokenColor('comment'), THEME.overlay);
    },
  },
  {
    name: 'THEME: number maps to peach',
    fn: () => {
      assert.deepEqual(tokenColor('number'), THEME.peach);
    },
  },
  {
    name: 'THEME: function maps to mauve',
    fn: () => {
      assert.deepEqual(tokenColor('function'), THEME.mauve);
    },
  },
  {
    name: 'THEME: all colour entries are 3-element RGB arrays',
    fn: () => {
      for (const [key, val] of Object.entries(THEME)) {
        assert.ok(Array.isArray(val), `THEME.${key} should be array`);
        assert.equal(val.length, 3, `THEME.${key} should have 3 channels`);
      }
    },
  },
];
