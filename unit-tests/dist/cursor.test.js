import assert from 'node:assert/strict';
import { Buffer } from '../../dist/editor/Buffer.js';
import { Cursor } from '../../dist/editor/Cursor.js';
export const suite = 'Cursor';
function buf(text) { return new Buffer(text); }
function cur(line = 0, col = 0) {
    const c = new Cursor();
    c.line = line;
    c.col = col;
    c.desiredCol = col;
    return c;
}
export const tests = [
    {
        name: 'clamp: line clamped to last line',
        fn: () => {
            const b = buf('a\nb\nc');
            const c = cur(99, 0);
            c.clamp(b);
            assert.equal(c.line, 2);
        },
    },
    {
        name: 'clamp: col clamped to line length',
        fn: () => {
            const b = buf('hi');
            const c = cur(0, 99);
            c.clamp(b);
            assert.equal(c.col, 2);
        },
    },
    {
        name: 'clamp: negative line clamped to 0',
        fn: () => {
            const b = buf('hello');
            const c = cur(-5, 0);
            c.clamp(b);
            assert.equal(c.line, 0);
        },
    },
    {
        name: 'moveUp: decrements line',
        fn: () => {
            const b = buf('a\nb\nc');
            const c = cur(2, 0);
            c.desiredCol = 0;
            c.moveUp(b);
            assert.equal(c.line, 1);
        },
    },
    {
        name: 'moveUp: stops at line 0',
        fn: () => {
            const b = buf('a\nb');
            const c = cur(0, 0);
            c.moveUp(b);
            assert.equal(c.line, 0);
        },
    },
    {
        name: 'moveUp: col uses desiredCol, capped to line length',
        fn: () => {
            const b = buf('short\nvery long line here');
            const c = cur(1, 18);
            c.desiredCol = 18;
            c.moveUp(b);
            assert.equal(c.line, 0);
            assert.equal(c.col, 5); // 'short'.length
        },
    },
    {
        name: 'moveDown: increments line',
        fn: () => {
            const b = buf('a\nb\nc');
            const c = cur(0, 0);
            c.moveDown(b);
            assert.equal(c.line, 1);
        },
    },
    {
        name: 'moveDown: stops at last line',
        fn: () => {
            const b = buf('a\nb');
            const c = cur(1, 0);
            c.moveDown(b);
            assert.equal(c.line, 1);
        },
    },
    {
        name: 'moveLeft: decrements col',
        fn: () => {
            const b = buf('hello');
            const c = cur(0, 3);
            c.moveLeft(b);
            assert.equal(c.col, 2);
            assert.equal(c.desiredCol, 2);
        },
    },
    {
        name: 'moveLeft: wraps to end of previous line at col 0',
        fn: () => {
            const b = buf('hello\nworld');
            const c = cur(1, 0);
            c.moveLeft(b);
            assert.equal(c.line, 0);
            assert.equal(c.col, 5);
        },
    },
    {
        name: 'moveLeft: does nothing at (0,0)',
        fn: () => {
            const b = buf('hello');
            const c = cur(0, 0);
            c.moveLeft(b);
            assert.equal(c.line, 0);
            assert.equal(c.col, 0);
        },
    },
    {
        name: 'moveRight: increments col',
        fn: () => {
            const b = buf('hello');
            const c = cur(0, 2);
            c.moveRight(b);
            assert.equal(c.col, 3);
            assert.equal(c.desiredCol, 3);
        },
    },
    {
        name: 'moveRight: wraps to start of next line at end of line',
        fn: () => {
            const b = buf('hello\nworld');
            const c = cur(0, 5);
            c.moveRight(b);
            assert.equal(c.line, 1);
            assert.equal(c.col, 0);
        },
    },
    {
        name: 'moveRight: does nothing at end of last line',
        fn: () => {
            const b = buf('hi');
            const c = cur(0, 2);
            c.moveRight(b);
            assert.equal(c.line, 0);
            assert.equal(c.col, 2);
        },
    },
    {
        name: 'moveToLineStart: sets col and desiredCol to 0',
        fn: () => {
            const c = cur(0, 5);
            c.moveToLineStart();
            assert.equal(c.col, 0);
            assert.equal(c.desiredCol, 0);
        },
    },
    {
        name: 'moveToLineEnd: sets col to line length',
        fn: () => {
            const b = buf('hello');
            const c = cur(0, 0);
            c.moveToLineEnd(b);
            assert.equal(c.col, 5);
            assert.equal(c.desiredCol, 5);
        },
    },
    {
        name: 'moveToFirstNonSpace: skips leading spaces',
        fn: () => {
            const b = buf('   hello');
            const c = cur(0, 0);
            c.moveToFirstNonSpace(b);
            assert.equal(c.col, 3);
            assert.equal(c.desiredCol, 3);
        },
    },
    {
        name: 'moveToFirstNonSpace: col 0 when no leading spaces',
        fn: () => {
            const b = buf('hello');
            const c = cur(0, 3);
            c.moveToFirstNonSpace(b);
            assert.equal(c.col, 0);
        },
    },
    {
        name: 'moveWordRight: skips word chars then non-word chars',
        fn: () => {
            const b = buf('hello world');
            const c = cur(0, 0);
            c.moveWordRight(b);
            assert.equal(c.col, 6); // past 'hello '
        },
    },
    {
        name: 'moveWordRight: from end of line moves to start of next line',
        fn: () => {
            const b = buf('hi\nworld');
            const c = cur(0, 2);
            c.moveWordRight(b);
            assert.equal(c.line, 1);
            assert.equal(c.col, 0);
        },
    },
    {
        name: 'moveWordLeft: moves to start of current word',
        fn: () => {
            const b = buf('hello world');
            const c = cur(0, 9);
            c.moveWordLeft(b);
            assert.equal(c.col, 6);
        },
    },
    {
        name: 'moveWordLeft: from col 0 moves to previous line and skips to word start',
        fn: () => {
            // Moves to previous line (col = line length), then walks back to start of word.
            // For 'hello', the whole line is one word so it lands at col 0.
            const b = buf('hello\nworld');
            const c = cur(1, 0);
            c.moveWordLeft(b);
            assert.equal(c.line, 0);
            assert.equal(c.col, 0);
        },
    },
    {
        name: 'setPos: updates line, col, and desiredCol',
        fn: () => {
            const c = new Cursor();
            c.setPos(3, 7);
            assert.equal(c.line, 3);
            assert.equal(c.col, 7);
            assert.equal(c.desiredCol, 7);
        },
    },
    {
        name: 'updateDesiredCol: syncs desiredCol to current col',
        fn: () => {
            const c = new Cursor();
            c.col = 5;
            c.desiredCol = 0;
            c.updateDesiredCol();
            assert.equal(c.desiredCol, 5);
        },
    },
    {
        name: 'desiredCol preserved across up/down movement',
        fn: () => {
            const b = buf('long line here\nhi\nlong line here');
            const c = cur(0, 14);
            c.desiredCol = 14;
            c.moveDown(b);
            assert.equal(c.line, 1);
            assert.equal(c.col, 2); // capped to 'hi'.length
            assert.equal(c.desiredCol, 14); // desiredCol unchanged by moveDown
            c.moveDown(b);
            assert.equal(c.line, 2);
            assert.equal(c.col, 14); // restored from desiredCol
        },
    },
];
