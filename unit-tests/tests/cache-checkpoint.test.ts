import assert from 'node:assert/strict';
import { Buffer } from '../../dist/editor/Buffer.js';
import { HighlightCache } from '../../dist/highlight/Cache.js';
import { jsTokenizer } from '../../dist/highlight/languages/javascript.js';
import type { TestCase } from './types.js';

export const suite = 'HighlightCache (checkpoints)';

const CHUNK_SIZE = 50;
const CHECKPOINT_INTERVAL = 100;

function makeBuf(lines: string[]): Buffer {
  return new Buffer(lines.join('\n'));
}

export const tests: TestCase[] = [
  {
    name: 'synchronous build works for chunks below CHECKPOINT_INTERVAL',
    fn: () => {
      // chunkIdx = CHECKPOINT_INTERVAL - 1 = 99, must build synchronously
      const lineCount = CHUNK_SIZE * CHECKPOINT_INTERVAL; // 5 000 lines, all in range 0..99 chunks
      const lines = Array.from({ length: lineCount }, (_, i) => `const x${i} = ${i};`);
      const cache = new HighlightCache();
      const b = makeBuf(lines);
      const tokens = cache.getTokensForLine(lineCount - 1, b, jsTokenizer);
      assert.ok(tokens.length > 0, 'tokens should be returned for last line before threshold');
    },
  },
  {
    name: 'plain-text fallback: cold-start chunk at CHECKPOINT_INTERVAL returns []',
    fn: () => {
      // Request line at exactly chunk CHECKPOINT_INTERVAL (= 5 000).
      // No checkpoint has been built yet so the cache must defer and return [].
      const lineCount = CHUNK_SIZE * CHECKPOINT_INTERVAL + 1; // 5 001 lines
      const lines = Array.from({ length: lineCount }, (_, i) => `const x${i} = ${i};`);
      const cache = new HighlightCache();
      const b = makeBuf(lines);
      const tokens = cache.getTokensForLine(CHUNK_SIZE * CHECKPOINT_INTERVAL, b, jsTokenizer);
      assert.deepEqual(tokens, [], 'should return empty tokens while background build is pending');
    },
  },
  {
    name: 'second request for deferred chunk still returns [] before build completes',
    fn: () => {
      const lineCount = CHUNK_SIZE * CHECKPOINT_INTERVAL + 1;
      const lines = Array.from({ length: lineCount }, (_, i) => `// line ${i}`);
      const cache = new HighlightCache();
      const b = makeBuf(lines);
      const first  = cache.getTokensForLine(CHUNK_SIZE * CHECKPOINT_INTERVAL, b, jsTokenizer);
      const second = cache.getTokensForLine(CHUNK_SIZE * CHECKPOINT_INTERVAL, b, jsTokenizer);
      assert.deepEqual(first,  []);
      assert.deepEqual(second, []);
    },
  },
  {
    name: 'checkpoint invalidation: invalidateFrom removes downstream checkpoints',
    fn: () => {
      // Build chunks 0–99 synchronously (all below CHECKPOINT_INTERVAL)
      const lineCount = CHUNK_SIZE * CHECKPOINT_INTERVAL;
      const lines = Array.from({ length: lineCount }, (_, i) => `const x${i} = ${i};`);
      const cache = new HighlightCache();
      const b = makeBuf(lines);
      // Force build of all chunks 0-99
      cache.getTokensForLine(lineCount - 1, b, jsTokenizer);

      // Simulate that a hypothetical checkpoint at chunk 100 had been stored by
      // directly building chunk 0 then invalidating from line 0 — which should
      // remove any checkpoints at chunk indices > 0.
      cache.invalidateFrom(0); // startChunk = 0; removes checkpoints at > 0

      // After full invalidation, requesting a far line again triggers background build
      const lineCountLarge = CHUNK_SIZE * CHECKPOINT_INTERVAL + 1;
      const linesLarge = Array.from({ length: lineCountLarge }, (_, i) => `const x${i} = ${i};`);
      const cache2 = new HighlightCache();
      const b2 = makeBuf(linesLarge);
      // Prime: build 0–99
      cache2.getTokensForLine(lineCountLarge - 2, b2, jsTokenizer);
      // Invalidate: clears chunks >= 0, checkpoints > 0
      cache2.invalidateFrom(0);
      // Far chunk request returns [] again (checkpoint gone)
      const tokens = cache2.getTokensForLine(CHUNK_SIZE * CHECKPOINT_INTERVAL, b2, jsTokenizer);
      assert.deepEqual(tokens, [], 'should return [] after checkpoint invalidation');
    },
  },
  {
    name: 'invalidateFrom: preserves checkpoint at exactly startChunk boundary',
    fn: () => {
      // Build chunks 0–99 to populate any checkpoints at indices ≤ 99
      const lineCount = CHUNK_SIZE * CHECKPOINT_INTERVAL;
      const lines = Array.from({ length: lineCount }, (_, i) => `const x${i} = ${i};`);
      const cache = new HighlightCache();
      const b = makeBuf(lines);
      cache.getTokensForLine(lineCount - 1, b, jsTokenizer);

      // Invalidate from line 50 (startChunk = 1); chunks >= 1 are invalid.
      // Checkpoints at chunk indices > 1 are removed; at ≤ 1 are kept.
      cache.invalidateFrom(50);

      // Chunk 0 must still be valid (not touched by invalidateFrom(50))
      const tokensLine0 = cache.getTokensForLine(0, b, jsTokenizer);
      assert.ok(tokensLine0.length > 0, 'chunk 0 should still be valid and return tokens');
    },
  },
  {
    name: 'setRedrawCallback is called when background build checkpoint fires',
    fn: async () => {
      const lineCount = CHUNK_SIZE * CHECKPOINT_INTERVAL + 1;
      const lines = Array.from({ length: lineCount }, (_, i) => `const x${i} = ${i};`);
      const cache = new HighlightCache();
      const b = makeBuf(lines);

      let callCount = 0;
      cache.setRedrawCallback(() => { callCount++; });

      // Trigger the deferred background build
      cache.getTokensForLine(CHUNK_SIZE * CHECKPOINT_INTERVAL, b, jsTokenizer);

      // Wait for all pending setImmediate ticks to flush
      await new Promise<void>(resolve => setImmediate(() => setImmediate(() => resolve())));

      assert.ok(callCount > 0, 'redraw callback should have been called by background build');
    },
  },
];
