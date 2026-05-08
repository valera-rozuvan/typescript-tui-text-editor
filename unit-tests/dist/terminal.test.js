import assert from 'node:assert/strict';
import { Terminal } from '../../dist/terminal/Terminal.js';
export const suite = 'Terminal';
export const tests = [
    {
        name: 'hideCursor returns correct ANSI sequence',
        fn: () => assert.equal(Terminal.hideCursor, '\x1b[?25l'),
    },
    {
        name: 'showCursor returns correct ANSI sequence',
        fn: () => assert.equal(Terminal.showCursor, '\x1b[?25h'),
    },
    {
        name: 'clearScreen returns correct ANSI sequence',
        fn: () => assert.equal(Terminal.clearScreen, '\x1b[2J\x1b[H'),
    },
    {
        name: 'clearToEOL returns correct ANSI sequence',
        fn: () => assert.equal(Terminal.clearToEOL, '\x1b[K'),
    },
    {
        name: 'reset returns correct ANSI sequence',
        fn: () => assert.equal(Terminal.reset, '\x1b[0m'),
    },
    {
        name: 'bold returns correct ANSI sequence',
        fn: () => assert.equal(Terminal.bold, '\x1b[1m'),
    },
    {
        name: 'dim returns correct ANSI sequence',
        fn: () => assert.equal(Terminal.dim, '\x1b[2m'),
    },
    {
        name: 'italic returns correct ANSI sequence',
        fn: () => assert.equal(Terminal.italic, '\x1b[3m'),
    },
    {
        name: 'underline returns correct ANSI sequence',
        fn: () => assert.equal(Terminal.underline, '\x1b[4m'),
    },
    {
        name: 'reverse returns correct ANSI sequence',
        fn: () => assert.equal(Terminal.reverse, '\x1b[7m'),
    },
    {
        name: 'moveTo produces 1-based row;col cursor position',
        fn: () => {
            assert.equal(Terminal.moveTo(1, 1), '\x1b[1;1H');
            assert.equal(Terminal.moveTo(10, 20), '\x1b[10;20H');
            assert.equal(Terminal.moveTo(24, 80), '\x1b[24;80H');
        },
    },
    {
        name: 'fg produces 24-bit foreground colour sequence',
        fn: () => {
            assert.equal(Terminal.fg(255, 0, 128), '\x1b[38;2;255;0;128m');
            assert.equal(Terminal.fg(0, 0, 0), '\x1b[38;2;0;0;0m');
        },
    },
    {
        name: 'bg produces 24-bit background colour sequence',
        fn: () => {
            assert.equal(Terminal.bg(30, 30, 46), '\x1b[48;2;30;30;46m');
        },
    },
    {
        name: 'fgRgb accepts a tuple and delegates to fg',
        fn: () => {
            assert.equal(Terminal.fgRgb([137, 180, 250]), Terminal.fg(137, 180, 250));
        },
    },
    {
        name: 'bgRgb accepts a tuple and delegates to bg',
        fn: () => {
            assert.equal(Terminal.bgRgb([30, 30, 46]), Terminal.bg(30, 30, 46));
        },
    },
    {
        name: 'append buffers output and flush writes it all at once',
        fn: () => {
            const written = [];
            const orig = process.stdout.write.bind(process.stdout);
            process.stdout.write = (s) => { written.push(s); return true; };
            try {
                const t = new Terminal();
                t.append('hello');
                t.append(' world');
                assert.equal(written.filter(s => s === 'hello world').length, 0, 'nothing written before flush');
                t.flush();
                assert.ok(written.includes('hello world'), 'flush writes accumulated string');
            }
            finally {
                process.stdout.write = orig;
            }
        },
    },
    {
        name: 'flush is a no-op when buffer is empty',
        fn: () => {
            const written = [];
            const orig = process.stdout.write.bind(process.stdout);
            process.stdout.write = (s) => { written.push(s); return true; };
            try {
                const t = new Terminal();
                const before = written.length;
                t.flush();
                assert.equal(written.length, before);
            }
            finally {
                process.stdout.write = orig;
            }
        },
    },
];
