import assert from 'node:assert/strict';
import { parseKeys } from '../../dist/terminal/Input.js';
export const suite = 'Input (parseKeys)';
function bytes(...vals) { return new Uint8Array(vals); }
export const tests = [
    {
        name: 'single printable ASCII character',
        fn: () => {
            const evs = parseKeys(bytes(0x61)); // 'a'
            assert.equal(evs.length, 1);
            assert.equal(evs[0].key, 'a');
            assert.equal(evs[0].char, 'a');
            assert.equal(evs[0].ctrl, false);
            assert.equal(evs[0].alt, false);
        },
    },
    {
        name: 'multiple printable ASCII characters',
        fn: () => {
            const evs = parseKeys(bytes(0x68, 0x69)); // 'hi'
            assert.equal(evs.length, 2);
            assert.equal(evs[0].key, 'h');
            assert.equal(evs[1].key, 'i');
        },
    },
    {
        name: 'enter key (CR)',
        fn: () => {
            const evs = parseKeys(bytes(0x0d));
            assert.equal(evs[0].key, 'enter');
        },
    },
    {
        name: 'enter key (LF)',
        fn: () => {
            const evs = parseKeys(bytes(0x0a));
            assert.equal(evs[0].key, 'enter');
        },
    },
    {
        name: 'tab key',
        fn: () => {
            const evs = parseKeys(bytes(0x09));
            assert.equal(evs[0].key, 'tab');
        },
    },
    {
        name: 'backspace (0x7f)',
        fn: () => {
            const evs = parseKeys(bytes(0x7f));
            assert.equal(evs[0].key, 'backspace');
        },
    },
    {
        name: 'backspace (0x08)',
        fn: () => {
            const evs = parseKeys(bytes(0x08));
            assert.equal(evs[0].key, 'backspace');
        },
    },
    {
        name: 'escape (lone ESC byte)',
        fn: () => {
            const evs = parseKeys(bytes(0x1b));
            assert.equal(evs[0].key, 'escape');
        },
    },
    {
        name: 'Ctrl+A through Ctrl+Z (excluding special-cased bytes)',
        fn: () => {
            // Bytes 8 (backspace), 9 (tab), 10/13 (enter) are intercepted
            // before the Ctrl+letter path and produce their own key events.
            const SKIP = new Set([8, 9, 10, 13]);
            for (let i = 1; i <= 26; i++) {
                if (SKIP.has(i))
                    continue;
                const evs = parseKeys(bytes(i));
                assert.equal(evs.length, 1);
                assert.equal(evs[0].ctrl, true, `byte 0x${i.toString(16)} should be ctrl`);
                assert.equal(evs[0].key, String.fromCharCode(i + 0x60));
            }
        },
    },
    {
        name: 'Ctrl+S specifically',
        fn: () => {
            const evs = parseKeys(bytes(0x13)); // Ctrl+S = 19
            assert.equal(evs[0].ctrl, true);
            assert.equal(evs[0].key, 's');
        },
    },
    {
        name: 'arrow up (CSI A)',
        fn: () => {
            const evs = parseKeys(bytes(0x1b, 0x5b, 0x41)); // ESC [ A
            assert.equal(evs[0].key, 'up');
            assert.equal(evs[0].ctrl, false);
        },
    },
    {
        name: 'arrow down (CSI B)',
        fn: () => {
            const evs = parseKeys(bytes(0x1b, 0x5b, 0x42));
            assert.equal(evs[0].key, 'down');
        },
    },
    {
        name: 'arrow right (CSI C)',
        fn: () => {
            const evs = parseKeys(bytes(0x1b, 0x5b, 0x43));
            assert.equal(evs[0].key, 'right');
        },
    },
    {
        name: 'arrow left (CSI D)',
        fn: () => {
            const evs = parseKeys(bytes(0x1b, 0x5b, 0x44));
            assert.equal(evs[0].key, 'left');
        },
    },
    {
        name: 'Ctrl+Right (CSI 1;5C)',
        fn: () => {
            // ESC [ 1 ; 5 C  — modifier 5 = ctrl
            const evs = parseKeys(bytes(0x1b, 0x5b, 0x31, 0x3b, 0x35, 0x43));
            assert.equal(evs[0].key, 'right');
            assert.equal(evs[0].ctrl, true);
        },
    },
    {
        name: 'home key (CSI H)',
        fn: () => {
            const evs = parseKeys(bytes(0x1b, 0x5b, 0x48));
            assert.equal(evs[0].key, 'home');
        },
    },
    {
        name: 'end key (CSI F)',
        fn: () => {
            const evs = parseKeys(bytes(0x1b, 0x5b, 0x46));
            assert.equal(evs[0].key, 'end');
        },
    },
    {
        name: 'delete key (CSI 3~)',
        fn: () => {
            const evs = parseKeys(bytes(0x1b, 0x5b, 0x33, 0x7e));
            assert.equal(evs[0].key, 'delete');
        },
    },
    {
        name: 'page up (CSI 5~)',
        fn: () => {
            const evs = parseKeys(bytes(0x1b, 0x5b, 0x35, 0x7e));
            assert.equal(evs[0].key, 'pageup');
        },
    },
    {
        name: 'page down (CSI 6~)',
        fn: () => {
            const evs = parseKeys(bytes(0x1b, 0x5b, 0x36, 0x7e));
            assert.equal(evs[0].key, 'pagedown');
        },
    },
    {
        name: 'F1 key (SS3 P)',
        fn: () => {
            const evs = parseKeys(bytes(0x1b, 0x4f, 0x50)); // ESC O P
            assert.equal(evs[0].key, 'f1');
        },
    },
    {
        name: 'F2 key (SS3 Q)',
        fn: () => {
            const evs = parseKeys(bytes(0x1b, 0x4f, 0x51));
            assert.equal(evs[0].key, 'f2');
        },
    },
    {
        name: 'home via SS3 H',
        fn: () => {
            const evs = parseKeys(bytes(0x1b, 0x4f, 0x48));
            assert.equal(evs[0].key, 'home');
        },
    },
    {
        name: 'UTF-8 2-byte character (é = U+00E9)',
        fn: () => {
            const evs = parseKeys(bytes(0xc3, 0xa9)); // é
            assert.equal(evs.length, 1);
            assert.equal(evs[0].char, 'é');
            assert.equal(evs[0].ctrl, false);
        },
    },
    {
        name: 'UTF-8 3-byte character (€ = U+20AC)',
        fn: () => {
            const evs = parseKeys(bytes(0xe2, 0x82, 0xac)); // €
            assert.equal(evs.length, 1);
            assert.equal(evs[0].char, '€');
        },
    },
    {
        name: 'Alt+a produces alt=true event',
        fn: () => {
            const evs = parseKeys(bytes(0x1b, 0x61)); // ESC a
            assert.equal(evs.length, 1);
            assert.equal(evs[0].alt, true);
            assert.equal(evs[0].key, 'a');
        },
    },
    {
        name: 'empty buffer returns no events',
        fn: () => {
            const evs = parseKeys(bytes());
            assert.equal(evs.length, 0);
        },
    },
    {
        name: 'Ctrl+\\ (0x1c)',
        fn: () => {
            const evs = parseKeys(bytes(0x1c));
            assert.equal(evs[0].ctrl, true);
            assert.equal(evs[0].key, '\\');
        },
    },
];
