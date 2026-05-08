import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { PtyProcess } from './PtyProcess.js';
import { TerminalScreen } from './TerminalScreen.js';
import { activeDebugServer } from './debug.js';

const _dirname = dirname(fileURLToPath(import.meta.url));

/* Absolute path to the compiled editor entry point */
export const EDITOR_PATH = join(_dirname, '../../dist/index.js');

/* The node binary running this process */
export const NODE_EXEC = process.execPath;

/* ── Key sequences ────────────────────────────────────────────────────────── */

export const KEY = {
  CTRL_Q:     '\x11', /* Quit editor */
  CTRL_S:     '\x13', /* Save */
  CTRL_N:     '\x0e', /* Next pane */
  CTRL_B:     '\x02', /* Toggle file browser */
  CTRL_F:     '\x06', /* In-file search */
  CTRL_P:     '\x10', /* Project search */
  CTRL_W:     '\x17', /* Close pane buffer */
  ESCAPE:     '\x1b',
  ENTER:      '\x0d',
  BACKSPACE:  '\x7f',
  ALT_1:      '\x1b1',
  ALT_2:      '\x1b2',  /* hsplit2 layout */
  ALT_3:      '\x1b3',  /* vsplit2 layout */
  ALT_4:      '\x1b4',  /* quad layout */
  ALT_RIGHT:  '\x1b[1;3C', /* next buffer in pane */
  ALT_LEFT:   '\x1b[1;3D', /* prev buffer in pane */
  ARROW_UP:   '\x1b[A',
  ARROW_DOWN: '\x1b[B',
  ARROW_RIGHT:'\x1b[C',
  ARROW_LEFT: '\x1b[D',
};

/* ── Sequence description (for debug step labels) ────────────────────────── */

function _describeSeq(seq: string): string {
  for (const [name, val] of Object.entries(KEY)) {
    if (val === seq) return name;
  }
  return JSON.stringify(seq);
}

/* ── Temp-file helpers ────────────────────────────────────────────────────── */

export function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'editor-ui-test-'));
}

export function createTempFile(dir: string, name: string, content = ''): string {
  const path = join(dir, name);
  writeFileSync(path, content, 'utf8');
  return path;
}

export function readTempFile(path: string): string {
  return readFileSync(path, 'utf8');
}

export function removeTempDir(dir: string): void {
  try { rmSync(dir, { recursive: true, force: true }); } catch {}
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
  readonly screen: TerminalScreen;
  private pty: PtyProcess | null = null;

  constructor(
    private readonly cols = 120,
    private readonly rows = 30,
    private readonly cwd?: string,
  ) {
    this.screen = new TerminalScreen(cols, rows);
  }

  /* Start the editor, wait for the first full render. */
  async start(fileArgs: string[] = [], idleMs = 300): Promise<void> {
    this.pty = new PtyProcess(NODE_EXEC, [EDITOR_PATH, ...fileArgs], this.cols, this.rows, this.cwd);
    const output = await this.pty.readOutput(idleMs, 8000);
    this.screen.feed(output);
    await activeDebugServer?.notifyStep('start()', this.screen);
  }

  /*
   * Send raw bytes (key sequences) to the editor and wait for the PTY to
   * become idle.  The screen is updated with any new output.
   */
  async keys(sequence: string, idleMs = 250): Promise<void> {
    if (!this.pty) throw new Error('EditorTest: not started');
    this.pty.write(sequence);
    const output = await this.pty.readOutput(idleMs, 5000);
    this.screen.feed(output);
    await activeDebugServer?.notifyStep(`keys(${_describeSeq(sequence)})`, this.screen);
  }

  /* Type individual printable characters one by one. */
  async type(text: string): Promise<void> {
    await this.keys(text);
  }

  /* ── assertions ─────────────────────────────────────────────── */

  assertContains(text: string, message?: string): void {
    if (!this.screen.containsText(text)) {
      throw new Error(
        message ?? `Screen does not contain ${JSON.stringify(text)}\n\n${this.screen.dump()}`
      );
    }
  }

  assertNotContains(text: string, message?: string): void {
    if (this.screen.containsText(text)) {
      throw new Error(
        message ?? `Screen should NOT contain ${JSON.stringify(text)}\n\n${this.screen.dump()}`
      );
    }
  }

  assertLineContains(row: number, text: string, message?: string): void {
    const line = this.screen.getLine(row);
    if (!line.includes(text)) {
      throw new Error(
        message ?? `Row ${row} does not contain ${JSON.stringify(text)}\n  Row: ${JSON.stringify(line)}`
      );
    }
  }

  assertStatusContains(text: string, message?: string): void {
    this.assertLineContains(this.rows - 1, text, message);
  }

  /*
   * Assert that `text` is visible within a horizontal column range.
   * Useful for confirming content is in the correct pane of a split layout.
   */
  assertInCols(text: string, colStart: number, colEnd: number, message?: string): void {
    if (!this.screen.containsTextInCols(text, colStart, colEnd)) {
      throw new Error(
        message ??
          `${JSON.stringify(text)} not found in cols ${colStart}-${colEnd}\n\n${this.screen.dump()}`
      );
    }
  }

  /*
   * Assert the terminal cursor sits at the given 0-indexed row and column.
   * After each render the editor leaves the cursor at the active input position,
   * so TerminalScreen.getCursor() reflects where input will appear next.
   */
  assertCursorAt(row: number, col: number, message?: string): void {
    const pos = this.screen.getCursor();
    if (pos.row !== row || pos.col !== col) {
      throw new Error(
        message ??
          `Expected cursor at row=${row} col=${col}, got row=${pos.row} col=${pos.col}\n\n${this.screen.dump()}`
      );
    }
  }

  isAlive(): boolean {
    return this.pty?.isAlive() ?? false;
  }

  /* ── cleanup ─────────────────────────────────────────────────── */

  cleanup(): void {
    this.pty?.cleanup();
    this.pty = null;
  }
}
