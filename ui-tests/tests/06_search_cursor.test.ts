/*
 * 06_search_cursor — verify that the terminal cursor tracks the project-search
 * input field as characters are typed one at a time.
 *
 * Scenario:
 *   1. Copy the fixture directory (which contains a .git marker and a single
 *      text file) to a temp location.
 *   2. Start the editor with no file open (cwd = tempDir).
 *   3. Press Ctrl+P to open the project-search panel.
 *   4. Verify the cursor is at the start of the input field (empty needle).
 *   5. Type six characters one at a time; after each character verify that
 *      the terminal cursor (tracked by TerminalScreen's ANSI parser) is at
 *      the correct cell inside the search input row.
 *
 * Expected cursor coordinates (0-indexed) for W=120, H=30:
 *
 *   panelW   = min(W-4, 90) = min(116, 90) = 90
 *   panelX   = floor((W - panelW) / 2)     = floor(30 / 2) = 15
 *   panelY   = floor(H * 0.15)             = floor(4.5)    = 4
 *   inputRow = panelY + 2                  = 6          ← constant
 *   inputCol = panelX + 2 + needle.length  = 17 + needle.length
 *
 * The TerminalScreen parser converts the 1-indexed ANSI ESC[row;colH sequence
 * back to 0-indexed, so getCursor() returns { row: 6, col: 17 + len }.
 */
import type { TestCase } from './types.js';
import { EditorTest, KEY, copyFixtureToTemp, removeTempDir } from './helpers.js';

export const suite = 'search_cursor';

const W = 120;
const H = 30;

/* Compute expected cursor coordinates from the same formulas as Renderer.ts */
function expectedCursor(needleLen: number): { row: number; col: number } {
  const panelW   = Math.min(W - 4, 90);
  const panelX   = Math.floor((W - panelW) / 2);
  const panelY   = Math.floor(H * 0.15);
  const inputRow = panelY + 2;                   // 0-indexed
  const inputCol = panelX + 2 + needleLen;       // 0-indexed: panelX + "> ".length + needle
  return { row: inputRow, col: inputCol };
}

export const tests: TestCase[] = [
  {
    name: 'Ctrl+P search cursor advances by one column per typed character',
    async fn() {
      const dir = copyFixtureToTemp('06_search_cursor');
      try {
        const t = new EditorTest(W, H, dir);
        try {
          await t.start();
          t.assertLineContains(0, '[No File]');

          /* Open project-search panel. */
          await t.keys(KEY.CTRL_P, 400);

          /* Verify cursor starts at the beginning of the input field (empty needle). */
          const emptyExp = expectedCursor(0);
          t.assertCursorAt(emptyExp.row, emptyExp.col,
            `cursor should be at input field start (needle="") — row=${emptyExp.row} col=${emptyExp.col}`);

          /* Type characters one at a time and check cursor after each. */
          const chars = ['h', 'e', 'l', 'l', 'o', '!'];
          let needle = '';
          for (const ch of chars) {
            await t.keys(ch, 300);
            needle += ch;
            const exp = expectedCursor(needle.length);
            t.assertCursorAt(exp.row, exp.col,
              `cursor wrong after typing '${ch}' (needle="${needle}") — ` +
              `expected row=${exp.row} col=${exp.col}`);
          }

        } finally {
          t.cleanup();
        }
      } finally {
        removeTempDir(dir);
      }
    },
  },
];
