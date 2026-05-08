import assert from 'node:assert/strict';
import { Buffer } from '../../dist/editor/Buffer.js';
import { searchInBuffer, searchInBuffers } from '../../dist/search/FileSearch.js';
export const suite = 'FileSearch';
function buf(text) { return new Buffer(text); }
export const tests = [
    {
        name: 'searchInBuffer: empty needle returns empty array',
        fn: () => {
            const results = searchInBuffer('', buf('hello\nworld'));
            assert.equal(results.length, 0);
        },
    },
    {
        name: 'searchInBuffer: matches lines containing the needle',
        fn: () => {
            const b = buf('foo bar\nhello world\nbaz');
            const results = searchInBuffer('hello', b);
            assert.equal(results.length, 1);
            assert.equal(results[0].line, 1);
            assert.equal(results[0].snippet, 'hello world');
        },
    },
    {
        name: 'searchInBuffer: no match returns empty array',
        fn: () => {
            const results = searchInBuffer('xyz', buf('foo\nbar'));
            assert.equal(results.length, 0);
        },
    },
    {
        name: 'searchInBuffer: matches on multiple lines',
        fn: () => {
            const b = buf('test one\ntest two\nno match');
            const results = searchInBuffer('test', b);
            assert.equal(results.length, 2);
            assert.equal(results[0].line, 0);
            assert.equal(results[1].line, 1);
        },
    },
    {
        name: 'searchInBuffer: result has correct buffer reference',
        fn: () => {
            const b = buf('hello');
            const results = searchInBuffer('hello', b);
            assert.equal(results[0].buffer, b);
        },
    },
    {
        name: 'searchInBuffer: result col is index of first matched char',
        fn: () => {
            const b = buf('  hello');
            const results = searchInBuffer('hello', b);
            assert.equal(results[0].col, 2);
        },
    },
    {
        name: 'searchInBuffer: matchIndices are populated',
        fn: () => {
            const b = buf('hello');
            const results = searchInBuffer('hlo', b);
            assert.ok(results.length > 0);
            assert.ok(results[0].matchIndices.length === 3);
        },
    },
    {
        name: 'searchInBuffers: empty needle returns empty array',
        fn: () => {
            const results = searchInBuffers('', [buf('hello'), buf('world')]);
            assert.equal(results.length, 0);
        },
    },
    {
        name: 'searchInBuffers: aggregates matches from all buffers',
        fn: () => {
            const b1 = buf('hello there');
            const b2 = buf('say hello');
            const results = searchInBuffers('hello', [b1, b2]);
            assert.equal(results.length, 2);
        },
    },
    {
        name: 'searchInBuffers: results sorted by buffer name then line number',
        fn: () => {
            const b1 = new Buffer('match here\nalso match');
            b1.filePath = '/z/zebra.txt'; // name 'zebra.txt' sorts after 'alpha.txt'
            const b2 = new Buffer('match line');
            b2.filePath = '/a/alpha.txt'; // name 'alpha.txt' sorts first
            const results = searchInBuffers('match', [b1, b2]);
            // b2 (alpha.txt) should come first, then two results from b1 (zebra.txt)
            assert.equal(results[0].buffer, b2);
            assert.equal(results[1].buffer, b1);
            assert.equal(results[2].buffer, b1);
        },
    },
];
