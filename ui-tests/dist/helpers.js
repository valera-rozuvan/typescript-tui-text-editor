import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { PtyProcess } from './PtyProcess.js';
import { TerminalScreen } from './TerminalScreen.js';
const _dirname = dirname(fileURLToPath(import.meta.url));
/* Absolute path to the compiled editor entry point */
export const EDITOR_PATH = join(_dirname, '../../dist/index.js');
/* The node binary running this process */
export const NODE_EXEC = process.execPath;
/* ── Key sequences ────────────────────────────────────────────────────────── */
export const KEY = {
    CTRL_Q: '\x11', /* Quit editor */
    CTRL_S: '\x13', /* Save */
    CTRL_N: '\x0e', /* Next pane */
    CTRL_B: '\x02', /* Toggle file browser */
    CTRL_F: '\x06', /* In-file search */
    CTRL_W: '\x17', /* Close pane buffer */
    ESCAPE: '\x1b',
    ENTER: '\x0d',
    BACKSPACE: '\x7f',
    ALT_1: '\x1b1',
    ALT_2: '\x1b2', /* hsplit2 layout */
    ALT_3: '\x1b3', /* vsplit2 layout */
    ALT_4: '\x1b4', /* quad layout */
    ALT_RIGHT: '\x1b[1;3C', /* next buffer in pane */
    ALT_LEFT: '\x1b[1;3D', /* prev buffer in pane */
    ARROW_UP: '\x1b[A',
    ARROW_DOWN: '\x1b[B',
    ARROW_RIGHT: '\x1b[C',
    ARROW_LEFT: '\x1b[D',
};
/* ── Temp-file helpers ────────────────────────────────────────────────────── */
export function createTempDir() {
    return mkdtempSync(join(tmpdir(), 'editor-ui-test-'));
}
export function createTempFile(dir, name, content = '') {
    const path = join(dir, name);
    writeFileSync(path, content, 'utf8');
    return path;
}
export function readTempFile(path) {
    return readFileSync(path, 'utf8');
}
export function removeTempDir(dir) {
    try {
        rmSync(dir, { recursive: true, force: true });
    }
    catch { }
}
/* ── EditorTest ───────────────────────────────────────────────────────────── */
/*
 * High-level helper for a single editor session.
 *
 * Usage:
 *   const t = new EditorTest();
 *   await t.start(['/path/to/file']);
 *   await t.keys('Hello World');
 *   t.assertContains('Hello World');
 *   t.cleanup();
 */
export class EditorTest {
    cols;
    rows;
    screen;
    pty = null;
    constructor(cols = 120, rows = 30) {
        this.cols = cols;
        this.rows = rows;
        this.screen = new TerminalScreen(cols, rows);
    }
    /* Start the editor, wait for the first full render. */
    async start(fileArgs = [], idleMs = 300) {
        this.pty = new PtyProcess(NODE_EXEC, [EDITOR_PATH, ...fileArgs], this.cols, this.rows);
        const output = await this.pty.readOutput(idleMs, 8000);
        this.screen.feed(output);
    }
    /*
     * Send raw bytes (key sequences) to the editor and wait for the PTY to
     * become idle.  The screen is updated with any new output.
     */
    async keys(sequence, idleMs = 250) {
        if (!this.pty)
            throw new Error('EditorTest: not started');
        this.pty.write(sequence);
        const output = await this.pty.readOutput(idleMs, 5000);
        this.screen.feed(output);
    }
    /* Type individual printable characters one by one. */
    async type(text) {
        await this.keys(text);
    }
    /* ── assertions ─────────────────────────────────────────────── */
    assertContains(text, message) {
        if (!this.screen.containsText(text)) {
            throw new Error(message ?? `Screen does not contain ${JSON.stringify(text)}\n\n${this.screen.dump()}`);
        }
    }
    assertNotContains(text, message) {
        if (this.screen.containsText(text)) {
            throw new Error(message ?? `Screen should NOT contain ${JSON.stringify(text)}\n\n${this.screen.dump()}`);
        }
    }
    assertLineContains(row, text, message) {
        const line = this.screen.getLine(row);
        if (!line.includes(text)) {
            throw new Error(message ?? `Row ${row} does not contain ${JSON.stringify(text)}\n  Row: ${JSON.stringify(line)}`);
        }
    }
    assertStatusContains(text, message) {
        this.assertLineContains(this.rows - 1, text, message);
    }
    /*
     * Assert that `text` is visible within a horizontal column range.
     * Useful for confirming content is in the correct pane of a split layout.
     */
    assertInCols(text, colStart, colEnd, message) {
        if (!this.screen.containsTextInCols(text, colStart, colEnd)) {
            throw new Error(message ??
                `${JSON.stringify(text)} not found in cols ${colStart}-${colEnd}\n\n${this.screen.dump()}`);
        }
    }
    isAlive() {
        return this.pty?.isAlive() ?? false;
    }
    /* ── cleanup ─────────────────────────────────────────────────── */
    cleanup() {
        this.pty?.cleanup();
        this.pty = null;
    }
}
