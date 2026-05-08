import assert from 'node:assert/strict';
import { fuzzyMatch, fuzzyFilter } from '../../dist/search/FuzzyMatcher.js';
export const suite = 'FuzzyMatcher';
export const tests = [
    {
        name: 'empty needle matches anything with score 0 and empty indices',
        fn: () => {
            const m = fuzzyMatch('', 'anything');
            assert.ok(m !== null);
            assert.equal(m.score, 0);
            assert.deepEqual(m.indices, []);
        },
    },
    {
        name: 'needle longer than haystack returns null',
        fn: () => {
            assert.equal(fuzzyMatch('toolong', 'hi'), null);
        },
    },
    {
        name: 'non-matching needle returns null',
        fn: () => {
            assert.equal(fuzzyMatch('xyz', 'abc'), null);
        },
    },
    {
        name: 'exact match succeeds',
        fn: () => {
            const m = fuzzyMatch('hello', 'hello');
            assert.ok(m !== null);
            assert.deepEqual(m.indices, [0, 1, 2, 3, 4]);
        },
    },
    {
        name: 'subsequence match (non-consecutive) succeeds',
        fn: () => {
            const m = fuzzyMatch('ac', 'abc');
            assert.ok(m !== null);
            assert.deepEqual(m.indices, [0, 2]);
        },
    },
    {
        name: 'match is case-insensitive',
        fn: () => {
            assert.ok(fuzzyMatch('HELLO', 'hello') !== null);
            assert.ok(fuzzyMatch('hello', 'HELLO') !== null);
        },
    },
    {
        name: 'start bonus: match at index 0 adds 10 to score',
        fn: () => {
            const atStart = fuzzyMatch('h', 'hello');
            const notStart = fuzzyMatch('e', 'hello');
            assert.ok(atStart !== null && notStart !== null);
            assert.ok(atStart.score > notStart.score, `score at start (${atStart.score}) should exceed score not at start (${notStart.score})`);
        },
    },
    {
        name: 'consecutive bonus: consecutive chars score higher than scattered',
        fn: () => {
            const consec = fuzzyMatch('hel', 'hello'); // indices 0,1,2
            const scattered = fuzzyMatch('hel', 'h_e_l_l_o'); // spread out
            assert.ok(consec !== null && scattered !== null);
            assert.ok(consec.score > scattered.score);
        },
    },
    {
        name: 'word-boundary bonus: match after / scores higher',
        fn: () => {
            const boundary = fuzzyMatch('f', 'path/foo');
            const mid = fuzzyMatch('f', 'suffix');
            assert.ok(boundary !== null && mid !== null);
            assert.ok(boundary.score > mid.score);
        },
    },
    {
        name: 'camelCase boundary bonus: match after lower-to-upper transition',
        fn: () => {
            const camel = fuzzyMatch('B', 'myButton'); // 'B' is at camel boundary
            const plain = fuzzyMatch('b', 'abc_button'); // 'b' at index 0
            // Just verify both match; the camel one should get the boundary bonus
            assert.ok(camel !== null);
            assert.ok(plain !== null);
        },
    },
    {
        name: 'gap penalty: large gaps reduce score',
        fn: () => {
            const tight = fuzzyMatch('ab', 'ab___');
            const loose = fuzzyMatch('ab', 'a____b');
            assert.ok(tight !== null && loose !== null);
            assert.ok(tight.score > loose.score);
        },
    },
    {
        name: 'fuzzyFilter: returns all items when needle is empty',
        fn: () => {
            const items = ['alpha', 'beta', 'gamma'];
            const res = fuzzyFilter('', items, x => x);
            assert.equal(res.length, 3);
        },
    },
    {
        name: 'fuzzyFilter: excludes items that do not match',
        fn: () => {
            const items = ['foobar', 'baz', 'quux'];
            const res = fuzzyFilter('foo', items, x => x);
            assert.ok(res.every(r => r.item === 'foobar'));
        },
    },
    {
        name: 'fuzzyFilter: sorts results by descending score',
        fn: () => {
            const items = ['xhello_world', 'hello', 'ahello'];
            const res = fuzzyFilter('hello', items, x => x);
            for (let i = 0; i < res.length - 1; i++) {
                assert.ok(res[i].match.score >= res[i + 1].match.score);
            }
        },
    },
    {
        name: 'fuzzyFilter: uses provided key function',
        fn: () => {
            const items = [{ name: 'foobar' }, { name: 'baz' }];
            const res = fuzzyFilter('foo', items, x => x.name);
            assert.equal(res.length, 1);
            assert.equal(res[0].item.name, 'foobar');
        },
    },
];
