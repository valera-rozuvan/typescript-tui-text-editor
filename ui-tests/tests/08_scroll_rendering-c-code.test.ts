/*
 * 08_scroll_rendering-c-code — verify that the virtual-screen diff renderer
 * stays consistent as the cursor moves down through the 2003-line Linux kernel
 * file kernel/exit.c one line at a time.
 *
 * After every down-arrow press the test asserts three things for each row in
 * the visible viewport:
 *   1. The status bar reports the correct line number.
 *   2. The content area of every visible row starts with the expected text
 *      (tabs expanded to exactly TAB_CHAR_COUNT spaces each — fixed-width).
 *   3. The space after each line's text is clean — no stray characters left
 *      over from a previously-rendered longer line on that row.
 *
 * This exercises the same diff-renderer correctness as test 07, but with real
 * C source code: lines vary widely in length, many lines begin with one or
 * more hard-tab characters, and blank lines appear throughout.
 *
 * Terminal: 120 × 30
 *   pane height   = 30 - 1 = 29  (status bar is the bottom terminal row)
 *   contentHeight = 29 - 1 = 28  (first pane row is the title bar)
 *   gutterWidth   = Math.max(3, len("2003")) + 1 = 5
 *   scrollLine    = max(0, cursorLine - 27)
 *   visible range = [scrollLine, scrollLine + 27]
 *   content cols  = [gutterWidth, COLS) = [5, 120)
 *
 * Fixture: ui-tests/fixtures/exit.c (Linux kernel/exit.c, 2003 lines).
 */
import type { TestCase } from './types.js';
import { EditorTest, KEY, createTempDir, createTempFile, removeTempDir } from './helpers.js';
import { TAB_CHAR_COUNT } from './constants.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const suite = 'scroll_rendering_c_code';

/* ── Constants ───────────────────────────────────────────────────────────── */

const COLS           = 120;
const ROWS           = 30;
const CONTENT_HEIGHT = ROWS - 2;   // pane.contentHeight = (ROWS-1) - 1 = 28
const GUTTER_WIDTH   = 5;          // Math.max(3, len("2003")) + 1

/* ── Fixture ─────────────────────────────────────────────────────────────── */

const _dirname = dirname(fileURLToPath(import.meta.url));

/*
 * Load the fixture once at module evaluation time so the path is resolved
 * relative to the compiled JS file (in ui-tests/dist/).
 */
const FIXTURE_CONTENT = readFileSync(
  join(_dirname, '../fixtures/exit.c'),
  'utf8',
);

/* ── Tab expansion ───────────────────────────────────────────────────────── */

/*
 * Convert a source line to its visual representation in the content area.
 *
 * `toVisual` mirrors the editor's fixed-width tab expansion: each '\t' always
 * expands to exactly TAB_CHAR_COUNT spaces, regardless of the current column
 * position.  Normal characters advance by one column.
 * `startCol` is the terminal column at which the content area begins
 * (= GUTTER_WIDTH = 5 for a 2003-line file); it is unused for tab width but
 * kept for API consistency.
 */
function toVisual(line: string, _startCol: number): string {
  let result = '';
  for (const ch of line) {
    if (ch === '\t') {
      result += ' '.repeat(TAB_CHAR_COUNT);
    } else {
      result += ch;
    }
  }
  return result;
}

/* ── Viewport helpers ────────────────────────────────────────────────────── */

function scrollLineFor(cursorLine: number): number {
  return Math.max(0, cursorLine - (CONTENT_HEIGHT - 1));
}

function visibleRange(
  cursorLine: number,
  numLines: number,
): { first: number; last: number; scrollLine: number } {
  const sl = scrollLineFor(cursorLine);
  return {
    scrollLine: sl,
    first:      sl,
    last:       Math.min(numLines - 1, sl + CONTENT_HEIGHT - 1),
  };
}

/* ── Per-row content assertion ───────────────────────────────────────────── */

/*
 * Assert that terminal row `screenRow` (0-indexed) contains:
 *   • the expected visual text in the content area (cols GUTTER_WIDTH..COLS-1),
 *   • only space characters after the text (no stray cells from prior renders).
 *
 * Lines longer than the visible content width are capped: the stray-character
 * check only applies to rows whose visible text ends before the right edge.
 */
function assertRowContent(
  screenLine:  string,   // t.screen.getLine(screenRow) — full COLS-wide string
  screenRow:   number,
  lineIndex:   number,   // 0-indexed file line shown on this row
  sourceLines: string[],
  context:     string,
): void {
  const contentWidth = COLS - GUTTER_WIDTH;                   // 115
  const contentArea  = screenLine.slice(GUTTER_WIDTH);        // cols 5..119

  /* Compute the visual text the editor would paint for this source line. */
  const visualLine   = toVisual(sourceLines[lineIndex], GUTTER_WIDTH);
  /* Cap to what fits in the content area — longer lines are just truncated. */
  const expectedText = visualLine.slice(0, contentWidth);

  if (!contentArea.startsWith(expectedText)) {
    const got = contentArea.slice(0, expectedText.length);
    throw new Error(
      `${context}\n` +
      `  Expected in content area: ${JSON.stringify(expectedText)}\n` +
      `  Got:                      ${JSON.stringify(got)}\n` +
      `  Full row ${screenRow}:    ${JSON.stringify(screenLine)}`,
    );
  }

  /* Only look for stray characters when the line is shorter than the content width. */
  const trailing   = contentArea.slice(expectedText.length);
  const firstStray = trailing.search(/[^ ]/);
  if (firstStray >= 0) {
    const strayCol = GUTTER_WIDTH + expectedText.length + firstStray;
    throw new Error(
      `${context}\n` +
      `  Stray character ${JSON.stringify(trailing[firstStray])} at terminal column ${strayCol} ` +
      `(row ${screenRow}, after "${expectedText.slice(-10)}")\n` +
      `  Full row ${screenRow}: ${JSON.stringify(screenLine)}`,
    );
  }
}

/* ── Tests ───────────────────────────────────────────────────────────────── */

export const tests: TestCase[] = [
  {
    name: 'diff renderer stays correct while navigating down through Linux kernel exit.c',
    async fn() {
      const dir         = createTempDir();
      const t           = new EditorTest(COLS, ROWS);

      /* Split into lines; trim trailing empty element if file ends with '\n'. */
      const sourceLines = FIXTURE_CONTENT.split('\n');
      if (sourceLines[sourceLines.length - 1] === '') sourceLines.pop();
      const numLines = sourceLines.length;

      try {
        const file = createTempFile(dir, 'exit.c', FIXTURE_CONTENT);
        await t.start([file]);

        /* ── initial state: cursor on line 1 (0-indexed line 0) ──────── */
        t.assertStatusContains('1:1', 'Initial: status must show 1:1');
        {
          const { first, last, scrollLine } = visibleRange(0, numLines);
          for (let li = first; li <= last; li++) {
            const screenRow = 1 + (li - scrollLine); // +1 for pane title bar
            assertRowContent(
              t.screen.getLine(screenRow),
              screenRow, li, sourceLines,
              `Initial: viewport line ${li + 1} (screen row ${screenRow})`,
            );
          }
        }

        /* ── press ↓ 100 times, verifying the full viewport each time ── */
        for (let step = 0; step < 100; step++) {
          /*
           * 60 ms idle window: the editor re-renders synchronously on every
           * keystroke (< 5 ms), so 60 ms is a safe margin.
           */
          await t.keys(KEY.ARROW_DOWN, 60);

          const cursorLine  = step + 1;       // 0-indexed
          const displayLine = cursorLine + 1; // 1-indexed for status bar

          /* 1. Status bar must show the correct line number. */
          t.assertStatusContains(
            `${displayLine}:`,
            `Step ${step + 1}: status must show line ${displayLine}`,
          );

          /* 2 & 3. Every visible row must have the right text and no trailing stray chars. */
          const { first, last, scrollLine } = visibleRange(cursorLine, numLines);
          for (let li = first; li <= last; li++) {
            const screenRow = 1 + (li - scrollLine);
            assertRowContent(
              t.screen.getLine(screenRow),
              screenRow, li, sourceLines,
              `Step ${step + 1} (cursor=line ${displayLine}, viewport ${first + 1}–${last + 1}): ` +
              `file line ${li + 1} on screen row ${screenRow}`,
            );
          }
        }
      } finally {
        t.cleanup();
        removeTempDir(dir);
      }
    },
  },
];
