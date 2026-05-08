import assert from 'node:assert/strict';
import { Buffer } from '../../dist/editor/Buffer.js';
import { HighlightCache } from '../../dist/highlight/Cache.js';
import { jsTokenizer } from '../../dist/highlight/languages/javascript.js';
export const suite = 'HighlightCache';
function makeBuf(lines) {
    return new Buffer(lines.join('\n'));
}
export const tests = [
    {
        name: 'getTokensForLine: returns tokens for a simple JS line',
        fn: () => {
            const cache = new HighlightCache();
            const b = makeBuf(['const x = 1;']);
            const tokens = cache.getTokensForLine(0, b, jsTokenizer);
            assert.ok(tokens.length > 0);
            const keyword = tokens.find(t => t.type === 'keyword');
            assert.ok(keyword, 'should have a keyword token for "const"');
        },
    },
    {
        name: 'getTokensForLine: returns empty array for empty line',
        fn: () => {
            const cache = new HighlightCache();
            const b = makeBuf(['']);
            const tokens = cache.getTokensForLine(0, b, jsTokenizer);
            assert.deepEqual(tokens, []);
        },
    },
    {
        name: 'getTokensForLine: caches results (same object on second call)',
        fn: () => {
            const cache = new HighlightCache();
            const b = makeBuf(['const x = 1;']);
            const first = cache.getTokensForLine(0, b, jsTokenizer);
            const second = cache.getTokensForLine(0, b, jsTokenizer);
            assert.equal(first, second);
        },
    },
    {
        name: 'getTokensForLine: correct line in second chunk (line 50)',
        fn: () => {
            const lines = Array.from({ length: 60 }, (_, i) => `const x${i} = ${i};`);
            const cache = new HighlightCache();
            const b = makeBuf(lines);
            const tokens = cache.getTokensForLine(50, b, jsTokenizer);
            assert.ok(tokens.length > 0);
        },
    },
    {
        name: 'invalidateFrom: marks affected chunks as invalid',
        fn: () => {
            const cache = new HighlightCache();
            const b = makeBuf(['const x = 1;', 'let y = 2;']);
            // Populate cache
            cache.getTokensForLine(0, b, jsTokenizer);
            cache.getTokensForLine(1, b, jsTokenizer);
            // Mutate buffer and invalidate
            b.lines[0] = '// comment';
            cache.invalidateFrom(0);
            // Re-fetch — should re-tokenize with mutated content
            const tokens = cache.getTokensForLine(0, b, jsTokenizer);
            const comment = tokens.find(t => t.type === 'comment');
            assert.ok(comment, 'should pick up new comment token after invalidation');
        },
    },
    {
        name: 'invalidateFrom: does not invalidate chunks before the given line',
        fn: () => {
            const lines = Array.from({ length: 60 }, (_, i) => `const x${i} = ${i};`);
            const cache = new HighlightCache();
            const b = makeBuf(lines);
            const before = cache.getTokensForLine(0, b, jsTokenizer);
            cache.invalidateFrom(50); // only second chunk
            const after = cache.getTokensForLine(0, b, jsTokenizer);
            assert.equal(before, after, 'first chunk tokens should be the same object (not re-built)');
        },
    },
    {
        name: 'clear: removes all cached chunks',
        fn: () => {
            const cache = new HighlightCache();
            const b = makeBuf(['const x = 1;']);
            const first = cache.getTokensForLine(0, b, jsTokenizer);
            cache.clear();
            // After clear the cache is empty; it will rebuild but return a new object
            const second = cache.getTokensForLine(0, b, jsTokenizer);
            assert.notEqual(first, second, 'should rebuild after clear');
        },
    },
    {
        name: 'block comment state propagates across chunk boundary',
        fn: () => {
            // First 49 lines normal, line 49 opens a block comment,
            // line 50 (new chunk) should continue in block-comment state.
            const lines = Array.from({ length: 52 }, (_, i) => i === 49 ? '/* start comment' :
                i === 50 ? 'inside comment */' :
                    `const x${i} = ${i};`);
            const cache = new HighlightCache();
            const b = makeBuf(lines);
            const tokens50 = cache.getTokensForLine(50, b, jsTokenizer);
            // Line 50 is inside a block comment so all tokens should be 'comment'
            assert.ok(tokens50.every(t => t.type === 'comment'), 'all tokens on continuation line should be comment');
        },
    },
];
